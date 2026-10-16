# Checkpoint C plan: Phase 5 (web drafts)

## Context
The server now stores the draft (`note_markdown`, `target_folder`), validates it on `PATCH /api/jobs/:id/draft` and saves it on `POST /api/jobs/:id/save` with no body. The web app still keeps edits in localStorage and sends a body on save, so after checkpoint B its save writes the server's original note and loses edits. Checkpoint C moves the review screen onto the server draft: API functions, an autosave hook, a properties panel, the textarea editing the whole note, and a save that flushes first. The rich editor (MDXEditor) is checkpoint D; the textarea stays until then. ADRs: 0020, 0021. TDD per task, one commit each, pushed. After each task: `pnpm test`, `lint`, `typecheck` in `apps/web` (and `packages/shared` if touched, which is not expected).

## Points to confirm
1. **Interim shim in 5.1.** Because `saveJob( id )` loses its body in 5.1, `useSaveJob` temporarily does `updateDraft` (built from the cached job's note with the edited title, tags and body via `parseNote` / `serializeNote`) and then `saveJob( id )`. That keeps the app saving the user's edits for 5.1–5.3; 5.4 removes it. Without it the app would silently save Claude's original note until 5.4.
2. **Interim flush in 5.4.** 5.4 saves with "flush, then `save.mutate()`" in `ReviewScreen`; 5.5 moves that into `useSaveJob` as the plan says (flush first, block on failure).
3. **Hook API.** `useAutosaveDraft( job )` returns `{ note, folder, setNote, setFolder, flush, status, message, adoptServerNote }`. `flush()` returns `Promise< boolean >` (true when nothing is pending or unsent after it). Local state is seeded once per job id; later server responses update the `['jobs', id]` cache but never the typed text. `adoptServerNote()` copies the server's normalized note into local state only when nothing is unsent; the review screen calls it on blur (and, in D, on mode switch).
4. **No autosave unless there is a draft.** A `summary_failed` job has no note; the hook sends nothing until the user edits, and the screen shows no editor for it.
5. **Legacy keys.** The one-time removal of `mnemosyne:draft:*` is a small hook (`useRemoveLegacyDrafts`) called once from `App`, so storage stays reachable only from hooks (web `CLAUDE.md` Layers).
6. **`TitleField`** stops being used in 5.4 but the folder is deleted in 8.2 as the tasks say.

## 5.1 API functions
- Files: `src/api/jobs.api.ts` + `jobs.api.test.ts`; new `src/api/vault.api.ts` + `vault.api.test.ts`; `src/hooks/useSaveJob.ts` (interim shim); `src/components/ReviewScreen/ReviewScreen.test.tsx` (save expectations).
- Tests first (stub `fetch`): `updateDraft( id, body )` sends `PATCH /api/jobs/<id>/draft` with JSON, returns the parsed `Job`, throws `ApiError` with the server's message on 400/409; `saveJob( id )` sends `POST .../save` with no body and returns `saved_path`; `listFolders()` GETs `/api/vault/folders` and returns the parsed response, rejects an unexpected shape. ReviewScreen save tests: Save calls `updateDraft` with a note carrying the edited title, tags and body, then `saveJob( id )`.
- Code: the three functions; `SaveJobBody` is no longer imported by `api/`; shim in `useSaveJob` keeps its `SaveJobBody` variable type.

## 5.2 `useAutosaveDraft`
- Files: `src/hooks/useAutosaveDraft.ts` + `useAutosaveDraft.test.ts`; `src/hooks/queryKeys.ts` unchanged.
- Tests first (fake timers, mocked `api/`, `renderHookWithClient`): initial values come from the job; an edit sets status `unsaved` and sends nothing before 1500 ms; one `updateDraft` call with the latest values at 1500 ms; further edits restart the timer; `flush()` sends at once and resolves true; edits during a request are sent after it as one request with the latest values and an older response never replaces newer text; at most one request in flight; status goes `saving` → `saved`; the returned job replaces the `['jobs', id]` cache entry (new `expires_at`); a rejection keeps the local text, status `error` with the message, and a later edit retries; `flush()` resolves false on error; folder change flushes immediately; `adoptServerNote()` applies the server note only when nothing is pending; unmount clears the timer.
- Code: refs for latest values, a timer, an in-flight promise and a "dirty again" flag; sends only the changed key(s) (`note_markdown`, `target_folder`).

## 5.3 `PropertiesPanel`
- Files: `src/components/PropertiesPanel/` (`PropertiesPanel.tsx`, `.module.css`, `.test.tsx`, `index.ts`).
- Tests first: shows the title in an input labelled Title and the tags (via `TagInput`, `mnemosyne` fixed); editing the title calls `onChange` with a note whose YAML has the new title and the body untouched; adding and removing a tag keeps `mnemosyne` first; source, channel and duration are read-only text; created shows "on save"; invalid YAML shows "front-matter invalid" (role status) with the fields disabled and `onChange` never called; a valid note after an invalid one re-enables it.
- Code: `parseNote` in render (try/catch to a local `ParsedNote | null`), `serializeNote` on change. Props: `{ note: string, onChange( note: string ): void }`.

## 5.4 Review screen on the server draft
- Files: `src/components/ReviewScreen/ReviewScreen.tsx` + test; `src/components/SummaryEditor/SummaryEditor.tsx` + test (`onBlur`); `src/components/FilenamePreview` unchanged; new small status line inside `ReviewScreen`; `src/hooks/useAutosaveDraft.ts` (`beforeunload`, + tests).
- Tests first: the textarea shows the whole note (front-matter included) and edits it; `PropertiesPanel` shows above it and shares the same note (editing the title changes the textarea text and vice versa); the filename preview follows the parsed title; a status line (`role="status"`) shows "Saving…", "Saved" or "Not saved: <reason>"; blur flushes; Save flushes then saves with no body, and shows the server error on failure; Save is disabled while the title is blank or the front-matter is invalid; no editor or panel for `summary_failed`; `beforeunload` is prevented while status is `unsaved`, `saving` or `error`, and not when `saved`; caret sync tests from 0.2.0 still pass on the textarea; the localStorage draft tests are removed (they assert the old behaviour).
- Code: `ReviewScreen` stops using `useDraft` and `TitleField`/`TagInput` directly; remove the 5.1 shim from `useSaveJob` (mutation takes no variables again).
- After this slice: run the dev server and look at the page in a browser (web `CLAUDE.md`), then say what I saw.

## 5.5 `useSaveJob` flushes first; `useDraft` removed
- Files: `src/hooks/useSaveJob.ts` + new `useSaveJob.test.ts`; delete `src/hooks/useDraft.ts` + `useDraft.test.ts`; `src/hooks/useJob.ts` + test and `src/hooks/useDiscardJob.ts` + test (drop `clearDraft`); new `src/hooks/useRemoveLegacyDrafts.ts` + test; `src/App.tsx`; `ReviewScreen.tsx` (pass `flush`); `apps/web/CLAUDE.md` (Layers: browser storage line; ADR list 0016 → 0020, 0021).
- Tests first: `useSaveJob( jobId, flush )` calls `flush`, then `saveJob( jobId )`, and invalidates the job queries; when `flush` resolves false it does not call `saveJob` and the mutation errors with a readable message; `useRemoveLegacyDrafts` removes only `mnemosyne:draft:*` keys, leaves others, never throws when storage is blocked; `useJob` / `useDiscardJob` tests no longer expect storage clean-up.
- Code: as above; the component's interim flush-then-save is replaced by `save.mutate()`.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`; shared and server unchanged.
- End of checkpoint: start the server and the web dev server against a scratch vault and a real or fixture job: edit in the textarea and panel, see "Saving…" → "Saved", reload and see the edits, open the job in a second browser, Save, and check the file in the vault. Report what I saw (screenshot), not ticked.
- Report: tasks with commit hashes, results per folder, ADRs (none new expected), anything deferred.
