# Mnemosyne v0.3.0 — Technical Requirements

Companion to `docs/v0.3.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.2.0 code at commit `91aafff`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet.

## 1. Changes at a glance
- **Shared:** a note module (parse, serialize, locked fields) built on the `yaml` package; folder-path validation; `Job` loses `summary_markdown` / `suggested_tags` and gains `note_markdown` / `target_folder`; new draft and folder schemas; `SaveJobBody` removed.
- **Server:** migration 2 (add columns, backfill) and migration 3 (drop old columns, last), with a migration runner that accepts functions; `completeSummary` stores the whole note; new `PATCH /api/jobs/:id/draft` and `GET /api/vault/folders`; save writes the stored draft to the chosen folder; a vault path resolver that keeps every write inside the vault; `DEFAULT_NOTE_FOLDER` config.
- **Web:** MDXEditor replaces the `SummaryEditor` textarea; a `PropertiesPanel`; a `FolderPicker`; a server autosave hook replaces `useDraft` (localStorage); caret sync re-done for the new editor.
- **Infra:** none. `docker-compose.yml` already mounts the whole vault at `/vault`.

## 2. Packages
| Package | Where | Why |
|---|---|---|
| `yaml` | shared | Parse and serialize front-matter on both client and server (ADR 0021) |
| `@mdxeditor/editor` | web | Rendered editor with a source-mode toggle and a front-matter plugin (ADR 0019) |

- Check both with Context7 before planning: the current MDXEditor API for the source/rich toggle (`diffSourcePlugin`), `frontmatterPlugin`, `markdownShortcutPlugin`, and its React 19 compatibility.
- `yaml` replaces the hand-written `quoted` helpers in `formatters/frontmatter.ts` for notes. The transcript formatter may keep using them; don't refactor it unless a test requires it.

## 3. Shared

### 3.1 Note module (`packages/shared/src/note.ts`, new)
```ts
type NoteProperties = { title: string, source: string, channel: string, duration: string, created: string, tags: string[] }
type ParsedNote = { properties: NoteProperties, body: string }

export const parseNote = ( markdown: string ): ParsedNote          // throws NoteParseError on missing/invalid front-matter
export const serializeNote = ( note: ParsedNote ): string
export const applyLockedProperties = ( note: ParsedNote, locked: LockedProperties ): ParsedNote
```
- `LockedProperties = { source, channel, duration, created }`. `applyLockedProperties` overwrites those fields and makes sure `mnemosyne` is the first tag (tags still pass through `normalizeTag`, deduped).
- `serializeNote` must produce the same front-matter layout as 0.2.0's `formatNote` (key order, flow-style `tags: [a, b]`, quoted strings), so notes written by 0.2.0 and 0.3.0 look the same in Obsidian. A test pins this against a 0.2.0 fixture.
- The body is kept byte-for-byte: `parseNote` → `serializeNote` of an unchanged note returns the input.
- The server's `formatNote` becomes a thin wrapper over `serializeNote`.

### 3.2 Folder paths (`packages/shared/src/folders.ts`, new)
- `isValidFolderName( name )`: non-empty, ≤ 100 chars, no `/ \ : * ? " < > |` or control characters, doesn't start with `.`, isn't `.` or `..`.
- `parseFolderPath( path )`: vault-relative POSIX path, `''` meaning the vault root; splits on `/`, every segment must pass `isValidFolderName`; no leading or trailing `/`. Returns the segments or throws.
- Both apps use these, so the picker and the server can't disagree.

### 3.3 Schemas
`Job` DTO (snake_case, as before):
- Removed: `summary_markdown`, `suggested_tags`
- Added: `note_markdown: string | null` (the whole note; null until summarized), `target_folder: string | null` (null = default)
- `title` stays, kept in sync with the note's front-matter by the server.

New in `api.ts`:
- `UpdateDraftBody { note_markdown?: string, target_folder?: string | null }`, at least one key present
- `UpdateDraftResponse { job: Job }`
- `FolderNode { name: string, path: string, children: FolderNode[] }`
- `ListFoldersResponse { default_folder: string, folders: FolderNode[] }`

Removed: `SaveJobBody` (save takes no body). `SaveJobResponse` unchanged.

## 4. Data

### 4.1 Migration runner
`jobStoreMigrations` becomes `Array< string | ( db: Database.Database ) => void >`. A string is `exec`'d as today; a function is called with the open database. Both run inside the existing transaction and bump `user_version`. Migration 1 is unchanged.

### 4.2 Migrations 2 and 3
**Migration 2 (function), early in the version:**
1. `ALTER TABLE jobs ADD COLUMN note_markdown TEXT` and `ADD COLUMN target_folder TEXT`.
2. Backfill: for every `ready_for_review` row, build `note_markdown` with `serializeNote` from `title`, `suggested_tags` (plus `mnemosyne`), the transcript's `meta`, today's date as `created`, and `summary_markdown` as the body. `summary_failed` rows have no summary and stay null; `saved` and other rows stay null.
- Until migration 3, `completeSummary` writes both the old columns and `note_markdown`, so every task ends with a working app.

**Migration 3 (SQL), in the last phase, once nothing reads the old columns:** `ALTER TABLE jobs DROP COLUMN summary_markdown` and `DROP COLUMN suggested_tags`.

- Each migration runs in the runner's transaction: if the backfill throws, nothing changes and the server fails to start with the error.
- Tests: an in-memory DB built at `user_version = 1` with `ready_for_review`, `summary_failed` and `saved` rows; after opening, check `note_markdown`, untouched null rows and `user_version`. Migration 3 is tested the same way from `user_version = 2`.

### 4.3 Repository
- `insertJob` / `updateJob` / row parsing use the new columns.
- New `updateDraft( id, { note_markdown, target_folder, title, expires_at, updated_at } )`, or reuse `updateJob` if it fits; the plan decides.

## 5. Server

### 5.1 Summary completion
`completeSummary` builds the note with `serializeNote` (title from the transcript, tags from the cleaned summary, locked fields from `meta`, `created` = today, body from `summary.formatter`) and stores it in `note_markdown`.

### 5.2 Draft update (`updateDraft` in `jobs.service.ts`, new)
For `PATCH /api/jobs/:id/draft`:
1. 409 unless the job is `ready_for_review`.
2. If `note_markdown` is present: `parseNote` (failure → `ValidationError` (400) with "front-matter invalid: <reason>"), `applyLockedProperties` from the transcript's `meta`, `serializeNote`, and copy `properties.title` into `title`.
3. If `target_folder` is present: `parseFolderPath` (failure → `ValidationError`, 400). `null` clears it. Existence isn't checked here; the folder may be one the user is about to create.
4. `expires_at = now + REVIEW_TTL_HOURS`; `updated_at = now`.
5. Return the updated `Job`.
- No conflict detection between tabs: last write wins.

### 5.3 Vault path resolver (`clients/vault.client.ts`)
`resolveFolder( vaultPath, relativeFolder )`:
- `parseFolderPath`, then `path.resolve( vaultPath, ...segments )`.
- Walk up to the nearest existing ancestor, `realpath` it, and require it to be the vault's realpath or inside it (prefix check with a trailing separator). This blocks `..` and symlinks that point out of the vault.
- After `mkdir( { recursive: true } )`, `realpath` the result and check again before writing.
- Throws `ValidationError` (→ 400) on any violation.

### 5.4 Save
`saveJob( id )` (no edits argument):
1. 409 unless `ready_for_review`; 409 if `note_markdown` is null.
2. `parseNote` the stored draft, `applyLockedProperties` with `created` = today, `serializeNote`.
3. `writeNote( vaultPath, folder, title, content )`: `folder` is `target_folder ?? DEFAULT_NOTE_FOLDER`, resolved with `resolveFolder`; `NOTES_FOLDER` is removed. Exclusive create and the `(2)`, `(3)` suffixes work as before.
4. Mark `saved` with `saved_path` and null the transcript, as before. Keep `note_markdown` (it's the saved note; cheap history).

### 5.5 Folder listing (`GET /api/vault/folders`, new)
- Walks the vault with `readdir( { withFileTypes: true } )`, directories only.
- Skips names starting with `.`, and doesn't follow symlinks (symlinked folders aren't listed).
- Sorted by name (case-insensitive) at every level.
- Returns `ListFoldersResponse` with `default_folder` from config.
- No caching; a vault with a few hundred folders walks in milliseconds. Revisit with lazy loading if it ever gets slow.

### 5.6 Config
| Var | Default | Notes |
|---|---|---|
| `DEFAULT_NOTE_FOLDER` | `Mnemosyne` | vault-relative; validated with `parseFolderPath` at startup |

On startup, after `assertVaultWritable`, create the default folder if it's missing (through `resolveFolder`).

### 5.7 API
| Method | Path | Notes |
|---|---|---|
| `PATCH` | `/api/jobs/:id/draft` | **new**: `UpdateDraftBody` → 200 `UpdateDraftResponse`; 404, 409 unless `ready_for_review`, 400 invalid YAML or folder |
| `POST` | `/api/jobs/:id/save` | **changed**: no body; writes the stored draft; 409 unless `ready_for_review` |
| `GET` | `/api/vault/folders` | **new**: `ListFoldersResponse` |

Everything else is unchanged.

## 6. Web

### 6.1 Note editor (`components/NoteEditor`, new; replaces `SummaryEditor`)
- MDXEditor with `diffSourcePlugin` (rich text ↔ source toggle, rich text by default), `frontmatterPlugin`, headings, lists, quotes, links, `markdownShortcutPlugin`, and a toolbar with the mode toggle.
- In **rich mode**, MDXEditor's own front-matter editor is hidden; the `PropertiesPanel` (§6.2) is the only way to edit properties. In **source mode**, the full note including YAML is shown.
- The editor's value is the full `note_markdown`. The component exposes `onChange( markdown )` and `onModeChange( mode )`.
- **Round-trip is a hard requirement** (§8). If MDXEditor can't round-trip the fixtures (escaping `[[`, rewriting `*` bullets, adding blank lines), stop and ask before working around it.

### 6.2 Properties panel (`components/PropertiesPanel`, new)
- Reads properties with `parseNote( noteMarkdown )`; on change, writes them back with `serializeNote` and calls the same `onChange` as the editor.
- Title: text field (replaces `TitleField`). Tags: the existing `TagInput` (`mnemosyne` fixed). Source, channel, duration, created: read-only text, with `created` shown as "on save".
- If the note doesn't parse (invalid YAML from source mode), the panel shows "front-matter invalid" and disables its fields until it parses again.

### 6.3 Folder picker (`components/FolderPicker`, new)
- Shows the current destination; opens a tree from `useFolders()` with the default folder selected when `target_folder` is null.
- Filter box: case-insensitive match on folder name; matching folders are shown with their ancestors.
- "New folder" creates a client-side pending child under the selected folder (or the root), validated with `isValidFolderName`; selecting it sets `target_folder` to its path. Pending folders aren't persisted beyond the draft's `target_folder`.
- `FilenamePreview` shows `<folder>/<noteBasename(title)>.md`.

### 6.4 Autosave (`hooks/useAutosaveDraft`, new; replaces `useDraft`)
- Local state holds the latest `note_markdown` and `target_folder`, seeded from the job.
- Debounce 1500 ms, plus immediate flush on mode toggle, editor blur, folder change and before save.
- At most one `PATCH` in flight. Edits during a request are sent after it finishes, as one request with the latest values, so an older response never overwrites newer text.
- Status: `saved | saving | unsaved | error` with a message; 400 shows the server's reason and keeps local text.
- On success, update the `['jobs', id]` cache with the returned job (new `expires_at`). Don't push the server's normalized note back into the editor while it has focus (cursor jumps); apply it to the properties panel, and to the editor on the next blur or mode switch.
- `beforeunload` warns while status is `unsaved`, `saving` or `error`.
- Delete `useDraft`, its tests and the `mnemosyne:draft:*` localStorage keys (a one-time clean-up on load is fine).

### 6.5 Save
`useSaveJob` flushes autosave, waits for it, then calls `POST /save` with no body. If the flush fails, save is blocked and the error shown.

### 6.6 Caret sync
0.2.0 reads the textarea's current line. Re-do it for both modes:
- Source mode: the current line of the source editor.
- Rich mode: the text content of the block containing the selection.
In both, find a timestamp in that text and scroll the transcript as before (existing `timestamp.ts` parsing). If MDXEditor doesn't expose selection in a testable way, stop and ask.

## 7. Removed
- `SummaryEditor`, `TitleField`, `useDraft` (+ tests), `SaveJobBody`, `NOTES_FOLDER`.
- Update `apps/web/CLAUDE.md` and `apps/server/CLAUDE.md` wherever they describe these.

## 8. Tests
- **Shared:** `parseNote` / `serializeNote` (round-trip byte-identical, 0.2.0 front-matter layout pinned, invalid YAML throws, missing front-matter throws); `applyLockedProperties` (overwrites source/channel/duration/created, re-adds and orders `mnemosyne`, normalizes and dedupes tags); `isValidFolderName` and `parseFolderPath` (each rejected character, `.`/`..`, leading dot, empty segments, leading/trailing `/`, `''` = root).
- **Server unit:** migrations 2 and 3 (§4.2); `updateDraft` (title sync, locked fields, expiry bump, 409, 400); `resolveFolder` against a temp vault (`..`, absolute, a symlink to outside the vault, a symlinked ancestor, nested create); folder listing (dot-folders and symlinks skipped, sorted); `saveJob` to a chosen folder, to the default, and with a stale invalid folder.
- **Server routes (Supertest):** `PATCH /draft` 200/400/404/409, `POST /save` with no body, `GET /api/vault/folders`.
- **Web:** `NoteEditor` round-trip on real 0.2.0 summaries plus fixtures with `[[wikilinks]]`, `*` and `-` bullets, `> quotes` with timestamp links, and front-matter; mode toggle preserves text. `PropertiesPanel` ↔ YAML sync and the invalid-YAML state. `FolderPicker` filter, new folder validation, default selection. `useAutosaveDraft` with fake timers (debounce, flushes, one in flight, latest wins, 400 keeps text, cache update). Caret sync in both modes.
- MDXEditor in jsdom may need extra setup (e.g. `ResizeObserver`, `Range` stubs). If it can't be made to render in jsdom, test round-trip through MDXEditor's Markdown import/export utilities and stop and ask before skipping editor tests.
- **Manual checklist** at the last checkpoint: a real video → edit in both modes → new nested folder → reload mid-edit → open in a second browser → save → note in the right folder and opens cleanly in Obsidian; run the migrations against a copy of the real 0.2.0 database.

## 9. Phases (detail in `tasks.md`)
1. Kick-off: `docs/README.md` points at v0.3.0; ADRs 0019–0022 in the index; 0016 marked superseded.
2. Shared: `yaml`; note module; folder paths; `formatNote` over `serializeNote`.
3. Server data: migration runner, migration 2, `note_markdown` / `target_folder` in the DTO, `completeSummary` stores the note.
4. Server vault and drafts: `resolveFolder`, `DEFAULT_NOTE_FOLDER`, folder listing, `PATCH /draft`, save from the draft.
5. Web drafts: API functions, `useAutosaveDraft`, save status, `PropertiesPanel`, the textarea editing the whole note, save flush, `useDraft` removed.
6. Web editor: MDXEditor round-trip tests first, `NoteEditor` with the toggle, invalid-YAML state, caret sync in both modes.
7. Web folder picker: `useFolders`, `FolderPicker`, filename preview with the folder.
8. Clean-up and verification: migration 3, old fields and `SaveJobBody` removed, CLAUDE.md and README updates, manual checklist.

Suggested checkpoints: **A** = phases 1–3, **B** = phase 4, **C** = phase 5, **D** = phase 6 (the riskiest; review it on its own), **E** = phases 7–8.

## 10. ADRs (new, drafted with this TRD)
- 0019 MDXEditor for the note editor
- 0020 Server-side drafts (supersedes 0016)
- 0021 The draft is the whole note as one Markdown string
- 0022 Vault-wide folder picker, writes confined to the vault

## 11. Open questions
None.
