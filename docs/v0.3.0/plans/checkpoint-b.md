# Checkpoint B plan: Phase 4 (server vault and drafts)

## Context
Checkpoint A put `note_markdown` / `target_folder` on `Job` and built the shared note and folder modules. Checkpoint B uses them on the server: a configurable default folder, a path resolver that keeps every write inside the vault, a folder-tree endpoint, a draft-update endpoint (autosave target), and a save that writes the stored draft. ADRs: 0020, 0021, 0022. TDD per task, one commit each, pushed. After each task run `pnpm test`, `lint`, `typecheck` in `apps/server` and `packages/shared` (4.2, 4.3 touch shared); the web app is only affected if shared types break it, so run its typecheck/tests for 4.2–4.4 too.

## Points to confirm
1. **`writeNote` signature.** It becomes `writeNote( vaultPath, folder, title, content )`, where `folder` is the vault-relative path (`''` = root) and the returned path is `<folder>/<name>.md` (or `<name>.md` at the root). It resolves the folder through `resolveFolder` itself, so the service can't skip the check. In 4.1 `writeNote` is untouched (still `NOTES_FOLDER`); 4.4 switches it.
2. **Where `resolveFolder` creates the folder.** It does the pre-check, `mkdir( recursive )`, then the post-`realpath` re-check, and returns the absolute directory. The startup "create default folder" is just a `resolveFolder` call.
3. **Config shape.** The flat `Config` gets `defaultNoteFolder` (env `DEFAULT_NOTE_FOLDER`); a bad value fails at startup through the existing `loadConfig` error path (a Zod `refine` using `parseFolderPath`). `''` env is treated as unset (default `Mnemosyne`), so the vault root can't be the default via env. Tell me if root should be allowed.
4. **Title on save.** The filename comes from the stored note's `title` property (re-parsed at save), not the `title` column; both are equal after 4.3.
5. **Existing save tests** (service, routes) build ready jobs with `completeSummary` so they already have a `note_markdown`; the ones that send an `edits` body are rewritten in 4.4. Tests that put a job into `ready_for_review` with `updateJob` only need `note_markdown` added where they save.
6. **Docker.** `docker-compose.yml` lists env vars explicitly; I will not pass `DEFAULT_NOTE_FOLDER` through unless you want it (the default works). `.env.example` gets the name only, commented out.

## 4.1 `DEFAULT_NOTE_FOLDER`, `resolveFolder`, startup
- Files: `src/config.ts` + `config.test.ts`; `src/clients/vault.client.ts` + `vault.client.test.ts`; `src/server.ts`; `../../.env.example`; `apps/server/CLAUDE.md` (Environment).
- Tests first:
  - config: default `defaultNoteFolder: 'Mnemosyne'`; override `Learning/AI`; empty string = unset; invalid (`../x`, `/abs`, `a//b`, `.hidden`) throws naming `DEFAULT_NOTE_FOLDER`. Update the two `toEqual` expectations.
  - `resolveFolder` against a temp vault: nested create (`A/B/C`), `''` returns the vault itself, existing folder reused, `..` / absolute / leading-slash / dot-folder rejected with `ValidationError`, a symlink inside the vault pointing outside rejected (final segment and an intermediate ancestor), a symlink inside the vault pointing to another folder inside the vault allowed, nothing created on rejection, post-mkdir `realpath` re-check (simulate with a symlink to outside as the nearest existing ancestor).
- Code: `resolveFolder`: `parseFolderPath` (map its error to `ValidationError`), `path.resolve( vault, ...segments )`, walk up to the nearest existing ancestor, `realpath` both it and the vault, prefix check with trailing separator, `mkdir`, `realpath` again and re-check, return the real path. `server.ts`: after `assertVaultWritable`, `await resolveFolder( config.vaultPath, config.defaultNoteFolder )` with the same exit-on-error handling.
- `server.test.ts`: if it asserts the boot order, add the default-folder step.

## 4.2 `GET /api/vault/folders`
- Files: `packages/shared/src/api.ts` + `api.test.ts` (`FolderNode`, `ListFoldersResponse`); `src/clients/vault.client.ts` (`listFolderTree`); `src/services/vault.service.ts`, `src/controllers/vault.controller.ts`, `src/routes/vault.routes.ts` (new, plus tests); `src/app.ts`.
- Tests first: shared schema accepts nested nodes, rejects missing `path`; client against a temp vault: only directories, dot-folders skipped (including nested), symlinked directories and files skipped, case-insensitive sort at every level, `path` is vault-relative POSIX; Supertest: 200 with `default_folder` from config and the tree, empty vault gives `[]`.
- Code: `FolderNode` via `z.lazy` recursive type; client walks with `readdir( { withFileTypes: true } )` using `isDirectory()` (false for symlinks); service attaches `default_folder`; route mounted under `/api`.

## 4.3 `PATCH /api/jobs/:id/draft`
- Files: `packages/shared/src/api.ts` + tests (`UpdateDraftBody`, `UpdateDraftResponse`); `src/services/jobs.service.ts` (`updateDraft`) + tests; `src/controllers/jobs.controller.ts`; `src/routes/jobs.routes.ts` + `jobs.routes.test.ts`; `src/repositories/jobStore.repository.ts` only if `updateJob` doesn't fit (it should).
- Tests first:
  - shared: body needs at least one key; `target_folder: null` valid; non-string rejected.
  - service: title in the note is copied to `title`; locked properties re-applied from `transcript.meta` (edited `source`, `channel`, `duration`, `created` overwritten, `mnemosyne` first); invalid YAML → `ValidationError` starting "front-matter invalid"; missing front-matter → same; invalid folder (`../x`) → `ValidationError`; `target_folder: null` clears; valid unknown folder accepted (not required to exist); `expires_at` = now + `reviewTtlHours` and `updated_at` bumped, including a folder-only update; 404; `ConflictError` from every status except `ready_for_review`; nothing is stored when validation fails.
  - routes: 200 returns `{ job }`, 400 invalid YAML / folder / empty body, 404, 409.
- Code: `updateDraft( id, body )` per TRD §5.2; controller parses `UpdateDraftBody`; route `PATCH /jobs/:id/draft`.

## 4.4 `saveJob( id )` writes the stored draft
- Files: `src/services/jobs.service.ts` + tests; `src/clients/vault.client.ts` (`writeNote` takes `folder`, `NOTES_FOLDER` removed) + tests; `src/controllers/jobs.controller.ts`; `src/routes/jobs.routes.test.ts`; `apps/server/CLAUDE.md` (Folder structure, vault client, anything naming `NOTES_FOLDER` or the Mnemosyne folder).
- Tests first:
  - `writeNote`: writes into a chosen nested folder (created), into the vault root for `''`, collisions give `(2)`, `(3)`; rejects a folder that escapes (via `resolveFolder`); returned path is vault-relative.
  - service: saves the draft's properties with `created` = today (stale `created` in the draft replaced) and the user's edits kept; writes to `target_folder`, or `defaultNoteFolder` when null; a stale invalid `target_folder` → `ValidationError` and the job stays `ready_for_review`; `note_markdown` null → `ConflictError`; non-review status → `ConflictError`; after save: `saved`, `saved_path`, transcript null, `note_markdown` kept, `title` from the note.
  - routes: `POST /save` with no body returns `saved_path`; a body, if sent, is ignored.
- Code: `saveJob( id )`: parse draft, `applyLockedProperties` with `created` = today, `serializeNote`, `writeNote( config.vaultPath, target_folder ?? config.defaultNoteFolder, properties.title, content )`. Controller stops parsing a body; `SaveJobBody` stays exported in shared until 8.2 (unused by the server afterwards).

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server` and `packages/shared`; web typecheck and tests after 4.2–4.4 (shared types changed).
- Manual smoke at the end of the checkpoint (not ticked, reported): run the server against a scratch vault, `curl` the folder tree, PATCH a draft, POST save, check the file landed in the chosen folder.
- Report: tasks with commit hashes, results per folder, ADRs (none new expected), anything deferred.
