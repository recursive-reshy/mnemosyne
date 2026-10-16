# Tasks — Mnemosyne v0.3.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or two phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results, anything deferred, and any ADR that changes the TRD (e.g. "ADR 0023 changes TRD §5"). Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR and add its number to the task's ADR column.
- Every task must leave the whole app working: old fields stay until Phase 8 removes them.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–3 (kick-off, shared, server data)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | `docs/README.md`: v0.3.0 is current (v0.2.0 marked done); add ADRs 0019–0022 to the index as Accepted (and set their Status lines); mark 0016 "Superseded by 0020" in the index and in its file | 0019–0022 | ✅ |
| **Phase 2** | **Shared** | | |
| 2.1 | Add `yaml` to `packages/shared`; `parseNote` / `serializeNote` in `note.ts`: byte-identical round-trip, 0.2.0 front-matter layout pinned by a fixture, invalid or missing front-matter throws `NoteParseError` | 0021 | ✅ |
| 2.2 | `applyLockedProperties`: overwrites source, channel, duration, created; `mnemosyne` first; tags normalized and deduped | 0021 | ✅ |
| 2.3 | `isValidFolderName` and `parseFolderPath` in `folders.ts` (`''` = vault root) | 0022 | ✅ |
| 2.4 | Server `formatNote` becomes a thin wrapper over `serializeNote`; existing note formatter tests stay green unchanged | 0021 | ✅ |
| **Phase 3** | **Server data** | | |
| 3.1 | Migration runner accepts `string \| ( db ) => void`; migration 1 unchanged; existing repository tests green | 0012, 0021 | ✅ |
| 3.2 | Migration 2: add `note_markdown`, `target_folder`; backfill `ready_for_review` rows (`summary_failed` / `saved` stay null); tests from a `user_version = 1` DB | 0021 | ✅ |
| 3.3 | `Job` DTO gains `note_markdown` and `target_folder` (old fields kept for now); repository reads and writes them; `completeSummary` also stores the whole note | 0021 | ✅ |

## Checkpoint B: Phase 4 (server vault and drafts)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Server vault and drafts** | | |
| 4.1 | `DEFAULT_NOTE_FOLDER` in config (validated with `parseFolderPath`); `resolveFolder` in `vault.client.ts` (`..`, absolute paths, symlinks out of the vault, realpath re-check after mkdir); the default folder is created at startup. Update `.env.example` and the Environment section of `apps/server/CLAUDE.md` | 0022 | ⬜ |
| 4.2 | `GET /api/vault/folders`: `FolderNode` / `ListFoldersResponse` in shared; tree of directories, dot-folders and symlinks skipped, sorted case-insensitively; new vault route/controller/service | 0022 | ⬜ |
| 4.3 | `PATCH /api/jobs/:id/draft`: `UpdateDraftBody` / `UpdateDraftResponse` in shared; `updateDraft` parses the note (400 on invalid YAML), re-applies locked properties, syncs `title`, validates `target_folder` (400), bumps `expires_at`; 404, 409 unless `ready_for_review` | 0020, 0021, 0022 | ⬜ |
| 4.4 | `saveJob( id )` writes the stored draft: re-apply locked properties with `created` = today, write to `target_folder ?? DEFAULT_NOTE_FOLDER` through `resolveFolder` (mkdir recursive), collisions as before; `NOTES_FOLDER` removed; 409 if `note_markdown` is null. The controller stops reading a body; `SaveJobBody` stays in shared until 8.2. Update `apps/server/CLAUDE.md` (folder structure, vault client) | 0020, 0022 | ⬜ |

## Checkpoint C: Phase 5 (web drafts)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 5** | **Web drafts** | | |
| 5.1 | `jobs.api.ts`: `updateDraft`, `saveJob` with no body; new `vault.api.ts` with `listFolders` | 0020 | ⬜ |
| 5.2 | `useAutosaveDraft`: debounce 1500 ms, `flush()`, at most one request in flight, latest values win, status `saved \| saving \| unsaved \| error`, updates `['jobs', id]` with the returned job; fake-timer tests | 0020 | ⬜ |
| 5.3 | `PropertiesPanel` (title, `TagInput`, read-only source/channel/duration, created "on save") reading and writing the note with `parseNote` / `serializeNote`; "front-matter invalid" state; replaces `TitleField` | 0021 | ⬜ |
| 5.4 | Review screen on the server draft: the existing textarea edits the whole `note_markdown`, the panel above it, a save-status line (`role="status"`), flush on blur, `beforeunload` warning while unsaved; caret sync keeps working on the textarea | 0020 | ⬜ |
| 5.5 | `useSaveJob` flushes autosave first and blocks on a failed flush; remove `useDraft`, its tests and draft clearing in `useJob` / `useDiscardJob`; one-time removal of `mnemosyne:draft:*` keys. Update `apps/web/CLAUDE.md` (Layers: browser storage line; ADR list) | 0020 | ⬜ |

## Checkpoint D: Phase 6 (web editor)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Web editor** | | |
| 6.1 | Add `@mdxeditor/editor` (check its API and React 19 support with Context7); jsdom setup it needs; round-trip tests on real 0.2.0 summaries and fixtures (`[[wikilinks]]`, `*` and `-` bullets, quotes with timestamp links, front-matter). **If round-trip fails, or MDXEditor can't be tested in jsdom, stop and ask** | 0019 | ⬜ |
| 6.2 | `NoteEditor`: rich text by default, source toggle (`diffSourcePlugin`), `frontmatterPlugin` with its UI hidden in rich mode; `onChange` / `onModeChange`; toggling keeps the text identical | 0019 | ⬜ |
| 6.3 | `NoteEditor` replaces the textarea on the review screen; flush on mode toggle; the server's normalized note goes into the editor only on blur or mode switch | 0019, 0020 | ⬜ |
| 6.4 | Caret sync in both modes: source = current line, rich = text of the block holding the selection; transcript scrolls as in 0.2.0. **If MDXEditor's selection can't be read testably, stop and ask.** Remove `SummaryEditor`. Update `apps/web/CLAUDE.md` (Stack: MDXEditor allowed by ADR 0019) | 0019 | ⬜ |

## Checkpoint E: Phases 7–8 (folder picker, clean-up, verification)
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Web folder picker** | | |
| 7.1 | `useFolders()` (`['vault', 'folders']`, fetched once per review screen) | 0022 | ⬜ |
| 7.2 | `FolderPicker`: tree with the default selected when `target_folder` is null, filter box (matches shown with their ancestors), "New folder" validated with `isValidFolderName` and created client-side only; choosing sets `target_folder` and flushes autosave | 0022 | ⬜ |
| 7.3 | `FilenamePreview` shows `<folder>/<noteBasename(title)>.md`; the destination survives a reload | 0022 | ⬜ |
| **Phase 8** | **Clean-up and verification** | | |
| 8.1 | Migration 3 drops `summary_markdown` and `suggested_tags` (tested from `user_version = 2`); `completeSummary` stops writing them | 0021 | ⬜ |
| 8.2 | Remove `summary_markdown`, `suggested_tags` from the `Job` DTO and `SaveJobBody` from shared; remove `TitleField` if unused; fix every reference in both apps | 0020, 0021 | ⬜ |
| 8.3 | Docs: README (review flow, folder picker, `DEFAULT_NOTE_FOLDER`), root `CLAUDE.md` architecture paragraph, ADR lists in both app `CLAUDE.md` files | — | ⬜ |
| 8.4 | Manual checklist (report results, don't tick until Naresh confirms): real video → edit in both modes → nested new folder → reload mid-edit → open in a second browser → expiry moves after edits → save → note in the right folder, opens cleanly in Obsidian; migrations run against a copy of the real 0.2.0 database | — | ⬜ |

---

## Log

- 1.1: README points at v0.3.0; ADRs 0019–0022 Accepted; 0016 superseded by 0020.
- 2.1: shared `note.ts` (`parseNote`, `serializeNote`, `NoteParseError`) on `yaml`; 0.2.0 layout pinned.
- 2.2: `applyLockedProperties` (locked fields overwritten, `mnemosyne` first, tags normalized and deduped).
- 2.3: shared `folders.ts` (`isValidFolderName`, `parseFolderPath`).
- 2.4: server `formatNote` is a wrapper over `serializeNote`; existing formatter tests unchanged and green.
- 3.1: migration runner (`runMigrations`) accepts SQL strings or functions; migration 1 unchanged.
- 3.2: migration 2 adds `note_markdown`, `target_folder` and backfills `ready_for_review` rows.
- 3.3: `Job` gains `note_markdown`, `target_folder`; repository reads/writes them; `completeSummary` stores the whole note.
