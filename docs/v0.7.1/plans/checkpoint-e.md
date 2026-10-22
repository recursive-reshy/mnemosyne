# Checkpoint E plan: Phase 7 (backups)

Next: checkpoint E, task 7.1. ADR 0051; TRD §6, §8, §10.1–10.2. Touches `apps/server`, `apps/web`, root Compose/`.env.example`, `docs/`, README. Not the agent or shared (`BackupResult` exists since 5.1). Gate per task: tests, lint, typecheck for each folder touched (web also `test:browser`; server also build at the end). No existing tests should change except where noted. No job behaviour changes. No new dependency (better-sqlite3's `backup()` is already there).

## Findings that shape the plan
- `status.service.ts` already reads the `backup` health row and parses its `detail` as JSON `{ file, bytes }` (`describeBackup`); 7.2 must store exactly that. The backup row already exists in `GET /api/status` ("Backups", never → ok).
- `openDatabase` (`repositories/database.ts:397`) opens, sets WAL, then `runMigrations`; there is no version guard. `migrations.length` is 8 now. `server.ts` calls `openDatabase` unguarded, so the exit needs a try/catch there like the vault check.
- `ConflictError` (409) exists in `errors.ts`; `errorMiddleware` already maps it. A plain `Error` becomes 500 with the message? To check when writing the route test (red first); if not, use the existing error class that maps to 500.
- `health.service.recordCheck` takes `{ ok: true, detail }`; failure also logs a `warn`.
- Compose: the data volume is `mnemosyne-data`, database file `mnemosyne.db` in `/data`. Real volume name (`<project>_mnemosyne-data`) is read from `docker volume ls` in 7.5, not guessed.
- `StatusPanel` rows are `StatusTableRow` / `StatusCard`; `RowControls` returns null unless failing. The Back up now button must show on the backup row in every state, so it is a new `BackupControls` rendered by both row layouts when `row.kind === 'backup'`, not part of `RowControls`.
- No byte formatter was found by a quick grep; 7.4 checks `apps/web/src` and shared for one before writing `formatBytes` (the server's `describeBackup` already formats size for the row's detail line; the result line reuses the same style).

## 7.1 Config and Compose
Tests first (`config.test.ts`): `BACKUP_DIR` default is `join( tmpdir(), 'mnemosyne-backups' )`, env override, empty string treated as unset. The two full-object `toEqual` checks gain `backupDir` (existing tests changed, listed in the log; same as 3.1/5.4). Red: no `backupDir`.
Code: `config.backupDir`; `docker-compose.yml` `mnemosyne` service gets `BACKUP_DIR: /backups` and the `${BACKUP_HOST_PATH:?…}:/backups` volume (not on `agent`); `BACKUP_HOST_PATH=` under Required in `.env.example` with the TRD comment; `BACKUP_DIR` in `apps/server/.env.example`. Check: `BACKUP_HOST_PATH=/tmp/x docker compose config` passes and without it fails with the message. Config files outside `config.ts` have no unit test; the compose check is the verification.

## 7.2 `backup.service.ts` and `POST /api/backups`
Tests first (`services/backup.service.test.ts`, real temp dirs and a real temp database, no mocks of better-sqlite3):
- a backup of a populated database (WAL, rows written) produces `mnemosyne-YYYYMMDD-HHmmss.db` in the dir, opens read-only with the same rows, `quick_check` ok, no `.partial` left; the dir is created when missing.
- name uses `Asia/Singapore` (fake timers at 2026-10-22T20:30:00Z → `20261023-043000`), not the process TZ.
- records `recordCheck` success with `detail` JSON `{ file, bytes }`, bytes equal to the file size; returns `BackupResult { file, bytes, at }`.
- a second call while one runs rejects with `ConflictError` and the first still completes; the lock is released afterwards (a third call works), including after a failure.
- failed `quick_check` (mock the check function seam, one injected dependency, not the whole module): partial deleted, nothing renamed, `recordCheck` failure with the message, error rethrown. A failing `backup()` (unwritable dir) records a failure and leaves no partial.
- an existing finished backup in the dir is never touched or deleted.
`routes/backups.routes.test.ts`: `POST /api/backups` → 201 body parses as `BackupResult`; 409 while running; 500 with the message on failure; mounted under `/api`.
Code: `services/backup.service.ts` (`runBackup`, module-level in-flight promise, `backupName( date )` helper using `Intl.DateTimeFormat` parts; the quick-check done by a small function opening `new Database( path, { readonly: true } )`), `controllers/backups.controller.ts`, `routes/backups.routes.ts`, mount in `app.ts` before `notFoundHandler`. Logging: `info` on success with file and bytes, no paths from the user beyond the file name.
Existing tests changed: none expected (`app` route tests don't enumerate routes).

## 7.3 Restore guard
Tests first (`database.test.ts`): a file whose `user_version` is `migrations.length + 1` makes `openDatabase` throw the TRD message with both numbers, leaves no open handle (a following `getDatabase()` throws "not open", and the file is unchanged, still that version); a current-version and an older database open and migrate as before. `server.ts` is not unit-tested (top-level script): the guard is exercised by hand in 10.3, and the exit is a try/catch in `server.ts` that logs `logger.error( { err }, 'The database cannot be opened' )` and `process.exit( 1 )`.
Code: `openDatabase` reads `user_version` after opening and before `journal_mode`/`runMigrations`; closes and throws a plain `Error` with the TRD §6.3 text. Check the guard runs before `journal_mode = WAL` writes anything, so a refused file is not modified.

## 7.4 Web: `useRunBackup` and Back up now
Tests first:
- `api/status.api.test.ts` (or new `backups.api.test.ts`, following the file layout of the other api files): `runBackup()` POSTs `/api/backups`, parses `BackupResult`, maps a 409/500 to an `ApiError` with the server message.
- `useRunBackup.test.ts`: success invalidates `statusKeys.all` (spy), exposes the result; error surfaces the message.
- `StatusPanel` tests (table and stacked): the backup row shows **Back up now** in OK, failing and never states, and no other row does; clicking calls the mutation; while pending the button is disabled and shows a `CircularProgress` with an accessible name; on success a `role="status"` line "Backed up to <file> (<size>)"; on error an `Alert` with the message; a 409 shows the server text. The existing "no Back up now yet" assertion from 6.2 is replaced (existing test changed, listed).
Code: `api/backups.api.ts` (or in `status.api.ts` if the pattern fits better; match the repo), `hooks/useRunBackup.ts` (no new query key; it invalidates `statusKeys.all`), `components/StatusPanel/BackupControls.tsx`, wired into `StatusTableRow` and `StatusCard`. Keep every file under the 150-line limit. Update `apps/web/CLAUDE.md` if it lists StatusPanel parts. Checked by hand in Chromium against the real server on a throwaway database and temp backup folder: button, pending, result line, a file on disk; light and dark; narrow. Screenshots for the report.

## 7.5 `docs/backups.md` and README link
No tests (docs). Fill in the real names: run `docker volume ls` and `docker compose config` to get the volume (`<project>_mnemosyne-data`), database file `mnemosyne.db` and the `-wal`/`-shm` names; verify the restore commands on a throwaway copy where possible (a scratch volume and scratch backups folder, not Naresh's real volume). Contents per TRD §6.5: what is and isn't backed up, backup file naming, restore steps, migrate-forward and newer-refused behaviour, `TOKEN_ENCRYPTION_KEY` loss, keep `.env` in a password manager, never delete behaviour. Link from the README (Settings/Configuration, plus `BACKUP_HOST_PATH` and `BACKUP_DIR` in the config table). The full restore drill is done with Naresh in 10.3.

## Order and commits
7.1 → 7.2 → 7.3 → 7.4 → 7.5; one commit each (`feat(7.1): …`, last one `docs(7.5): …`) with the `tasks.md` tick and log line, files staged by name, pushed. Tick the checkpoint E Plan cell and commit this plan to `docs/v0.7.1/plans/checkpoint-e.md` first (`docs(plan): checkpoint E`).

## End of checkpoint
Report: tasks with commit hashes; server (tests, lint, typecheck, build) and web (unit, `test:browser`, lint, typecheck, build) results; `docker compose config` with and without `BACKUP_HOST_PATH`; screenshots of Back up now (idle, pending, result, error); ADRs: none new, no TRD change; `.env` reminder: Naresh must add `BACKUP_HOST_PATH` before the next `docker compose up` (release notes in 10.4). `pnpm e2e` does not exist until checkpoint F.

## Verification
Per task as above. By hand: run the real server on a copy of a database with `BACKUP_DIR` pointed at a temp folder, `curl -X POST /api/backups` twice in parallel (one 201, one 409), open the file with `sqlite3` and run `PRAGMA quick_check`; bump `user_version` on a copy and confirm the server exits 1 with the message and does not modify the file.

## Decisions
1. The backup row's Back up now lives in a new `BackupControls`, not `RowControls`, because `RowControls` is for failing rows only.
2. The quick-check is a small injected function so the failure path is testable without corrupting a real file.
3. Both are inside ADR 0051; no new ADR.
