# Checkpoint E plan: Phases 7–8 (folder picker, clean-up, verification)

## Context
Checkpoints A–D built the whole-note draft, the server endpoints (`GET /api/vault/folders`, `PATCH /draft`, save to a chosen folder) and the editor. Checkpoint E finishes the feature: the web folder picker (ADR 0022), then the clean-up that removes the 0.2.0 fields (migration 3, `Job` DTO, `SaveJobBody`, `TitleField`), the docs, and the manual checklist. ADRs: 0020, 0021, 0022. TDD per task, one commit each, pushed. After each task: `pnpm test`, `lint`, `typecheck` in every touched folder. Out of scope, as you said: the timestamp-click / caret-sync problem in a real browser, and lazy-loading `NoteEditor` (both are in the `tasks.md` log).

## Points to confirm
1. **8.1 and 8.2 are coupled.** `StoredJob` extends the shared `Job`, which still requires `summary_markdown` / `suggested_tags` until 8.2. So 8.1 drops the columns and stops reading and writing them in the repository, but `toStoredJob` fills the two fields with constants (`null`, `[]`) so the DTO still validates and the app keeps working; 8.2 deletes those constants together with the fields. Without that shim 8.1 would break the app.
2. **Migration 3 can't be undone, and 0.2.0 can't run on it.** Dropping the columns makes the 0.2.0 server fail on insert. Before you rebuild the container with 8.1, copy `mnemosyne.db` out of the `mnemosyne-data` volume. (Your container has already run migrations 1–2.)
3. **Picking the default folder stores `null`** ("null = default", ADR 0022), and a **"Vault root"** entry (path `''`) is selectable since the shared rules and the server allow it. Say if you don't want the root offered.
4. **Preview before the default is known.** The default folder name only comes from `GET /api/vault/folders`. Until it loads (or if it fails) and `target_folder` is null, the preview says "Saved in the default folder as `<name>.md`" rather than hard-coding `Mnemosyne`.
5. **The picker is a disclosure** (a "Change folder" button with `aria-expanded`) holding nested lists of buttons (`aria-pressed` on the chosen one), not a full ARIA tree with arrow-key navigation.
6. **`ReviewScreen` size.** It is at about 150 lines; if 7.2–7.3 push it over, the status line, alerts and buttons move into a `ReviewActions` component in the same commit.
7. **8.4 is partly mine, partly yours.** I can't drive a browser or a real video here. I'll run what is scriptable (server flow on a scratch vault, expiry moving, migrations 1→3 on a synthesized 0.2.0 database), write the exact steps for the browser parts, and leave 8.4 unticked until you confirm.

## 7.1 `useFolders()`
- Files: `apps/web/src/hooks/useFolders.ts` + `.test.ts`; `hooks/queryKeys.ts` (`vaultKeys.folders = ['vault', 'folders']`).
- Tests first (mocked `api/vault.api`, `renderHookWithClient`): returns `{ defaultFolder, folders, error }`; calls `listFolders` once for several renders; a second hook in the same client reuses the cache; a failed request gives a readable `error` and keeps `folders` empty; no polling.
- Code: `useQuery` with the key, no refetch on focus (already the app default).

## 7.2 `FolderPicker`
- Files: `apps/web/src/components/FolderPicker/` (`FolderPicker.tsx`, `FolderTree.tsx` if it passes ~150 lines, `.module.css`, `.test.tsx`, `index.ts`).
- Props: `{ folders: FolderNode[], defaultFolder: string, value: string | null, onChange( folder: string | null ): void }`.
- Tests first: shows the current destination (the default when `value` is null) and opens the tree from a "Change folder" button; the default folder is marked as chosen when `value` is null; choosing a folder calls `onChange( path )`, choosing the default calls `onChange( null )`, "Vault root" calls `onChange( '' )`; the filter box (labelled) keeps folders whose name matches case-insensitively, anywhere in the tree, together with their ancestors, and says when nothing matches; "New folder" under the chosen folder takes a name, rejects `a/b`, `.x`, `..`, empty and long names with a message (`isValidFolderName`), and on a valid name shows the folder as pending and calls `onChange( 'Parent/Name' )`; a name that already exists as a sibling just selects it; a `value` that isn't in the tree (a pending folder after a reload) is shown as "new" with its ancestors.
- Code: pending folders are derived from `value` plus the ones added in this session (state), merged into the displayed tree; nothing is sent to the server except via `onChange`.

## 7.3 `FilenamePreview` with the folder; wire it up
- Files: `FilenamePreview.tsx` + test; `ReviewScreen.tsx` + test; `ReviewScreen` mock of `useFolders`.
- Tests first: `FilenamePreview` with `folder="Learning/AI"` shows `Learning/AI/What Is RAG A Primer.md`; `folder=""` shows the bare file name; `folder` unknown shows the "default folder" wording; the existing title cases keep passing with a folder. `ReviewScreen`: the picker is shown for a review job; choosing a folder calls `updateDraft( id, { target_folder } )` at once (flush on folder change); the preview follows it; a job opened with `target_folder: 'Learning'` shows that destination after a reload; folders failing to load shows a message and the default wording, and Save still works.
- Code: `ReviewScreen` calls `useFolders()` once, passes `autosave.folder` / `autosave.setFolder` to the picker, and `folder ?? defaultFolder` to the preview.

## 8.1 Migration 3; `completeSummary` stops writing the old columns
- Files: `apps/server/src/repositories/jobStore.repository.ts` + test; `services/jobs.service.ts` + test; `worker/summarizeJob.ts` + test if its call changes.
- Tests first: a DB built at `user_version = 2` with `ready_for_review`, `summary_failed` and `saved` rows (old columns filled): after `runMigrations`, `summary_markdown` and `suggested_tags` are gone, `note_markdown`, `target_folder` and every other column survive unchanged, `user_version` is 3; a failing migration 3 rolls back; `completeSummary` no longer passes the two fields; inserting and updating a job works against the 3-column-less table; the `table_info` test lists the final columns.
- Code: migration 3 as SQL (`ALTER TABLE jobs DROP COLUMN …` twice); `insertJob` / `updateJob` / `JobRow` stop naming the two columns; `toStoredJob` fills `summary_markdown: null`, `suggested_tags: []` (removed in 8.2). `completeSummary` keeps its signature but only stores `note_markdown`.

## 8.2 Remove the old fields everywhere
- Files: `packages/shared/src/job.ts`, `api.ts` and their tests; `apps/server` (`jobStore.repository.ts` shim, `jobs.service.ts` `toPublicJob`, tests that build jobs); `apps/web/src/test-support/job.fixture.ts`; delete `apps/web/src/components/TitleField/`; `apps/web/CLAUDE.md` if it mentions it.
- Tests first: `Job` rejects nothing new but no longer lists the two fields (a payload with them still parses because Zod strips unknown keys; assert the parsed result has no such keys); `SaveJobBody` is gone from `api.ts` and its test; `queueJob` and `toPublicJob` outputs no longer contain them (update the `toEqual` expectations); typecheck proves the rest.
- Code: delete the fields, `SaveJobBody` + `SaveJobBody` tests, the repository shim, `TitleField`; fix every reference the compiler reports.

## 8.3 Docs
- Files: `README.md` (how it works; using it: pick a folder, create one, drafts autosave, 24 h restarts on edits; API list gains `PATCH /api/jobs/:id/draft` and `GET /api/vault/folders` and drops the save body; configuration table gains `DEFAULT_NOTE_FOLDER`; the line saying notes go to `<vault>/Mnemosyne/`), root `CLAUDE.md` (architecture paragraph: whole-note draft, folder choice, autosave), `apps/server/CLAUDE.md` and `apps/web/CLAUDE.md` ADR lists (final check), `.env.example`.
- No tests; I check every statement against the code (env names, routes, behaviour) and run `grep` for stale `NOTES_FOLDER`, `useDraft`, `SummaryEditor`, `SaveJobBody`, `Mnemosyne/` claims.
- `docs/v0.3.0/prd.md` and `trd.md` are not touched (TRD §6.1 / §8 are overridden by ADR 0023 until you update them; I'll list that in the report).

## 8.4 Manual checklist (report only, not ticked)
- I run: the server on a scratch vault with a seeded review job: folder tree, draft PATCH, expiry moving after each edit, save into a new nested folder, file contents; migrations 1→2→3 on a database built from the 0.2.0 schema with realistic rows; the final `pnpm test`, `lint`, `typecheck`, `build` in all folders.
- You run (steps written in the report): real video → edit in both modes → nested new folder → reload mid-edit → second browser → expiry moves after edits → save → note in the right folder and opens cleanly in Obsidian; migration 3 on a backed-up copy of the real database.
- 8.4 stays ⬜ until you confirm.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in each touched folder (shared, server, web); at the end all three plus `pnpm build` in `packages/shared` then `apps/web`.
- Checkpoint report: tasks with commit hashes, results per folder, ADRs (none new expected; 0023 is already recorded), the TRD sections ADR 0023 overrides, and the two follow-ups left in the log.
