# Mnemosyne v0.9.1 — Technical Requirements

Companion to `docs/v0.9.1/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.9.0 code at commit `4584df1`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet. A **skipped path** is a vault-relative folder or note path that a walk could not read and left alone.

## 1. Changes at a glance
- **Learning root created on save** (ADR 0072): `updateSettings` validates `melete_learning_root` with `resolveFolder` (creates, confined to the vault) instead of `resolveExistingFolder`. The scan, generator and review keep `resolveExistingFolder` and never write.
- **Unreadable folders skipped:** `listFolderTree` skips a subfolder it can't read and reports it through a callback, logged at `warn` by `listFolders`. `walkSubject` returns the files it read plus the paths it skipped; `applyScan` leaves notes under a skipped path untouched; the last scan's skipped paths are kept per user in memory and returned on `GET /api/melete/today` as `skipped_paths`; the Melete page shows them.
- **Obsidian link per user:** `obsidianUrl( vaultDir, note.path )` with the user's `vault_dir`; `OBSIDIAN_VAULT_NAME` leaves `config.ts` and joins `IGNORED_VARIABLES`.
- **Shared:** `GetMeleteTodayResponse.skipped_paths` (new field). Nothing else.
- **Server:** `clients/vault.client.ts` (`listFolderTree`), `services/vault.service.ts` (`listFolders`, new `vaultDirFor`), `services/settings.service.ts` (`updateSettings`), `melete/scan.ts` (`walkSubject`), `services/meleteScan.service.ts` (`readNote`, `runScan`, `applyScan`), `melete/scanOutcome.ts` (new), `services/melete.service.ts` and `services/meleteReview.service.ts` (Obsidian link, `getToday`), `config.ts`.
- **Web:** `components/MeleteToday` (skipped-paths notice), `test-support/melete.fixture.ts`; `LearningRootSetup` is unchanged in code.
- **Agent, e2e fakes, Docker:** no change.
- **New dependencies:** none.
- **Environment (server):** `OBSIDIAN_VAULT_NAME` removed (ignored with a startup warning if present). Nothing added.
- **Schema:** unchanged. `SCHEMA_BASE` and the migrations list stay as in 0.9.0.

## 2. Shared contracts (`packages/shared`)

### 2.1 Melete (`melete.ts`)
```ts
GetMeleteTodayResponse = {
  learning_root: string | null,
  subjects: MeleteSubject[],
  totals: MeleteReviewCounts,
  skipped_paths: string[],          // new, required; vault-relative paths the last scan could not read, [] when none or no scan yet
}
```
Required, not optional, so the web fixtures and the server's response are forced to agree (the same choice as `Me.vault_missing` in 0.9.0). Paths are relative to the vault root, as `MeleteNote.path` is, sorted, de-duplicated, and a folder path has no trailing slash. `GetMeleteSubjectResponse` is unchanged: the subject page relies on the notice on the Melete page.

## 3. Learning root (ADR 0072)

### 3.1 Server (`services/settings.service.ts`)
In `updateSettings`, the check
```ts
await resolveExistingFolder( vaultRootFor( userId ), body.melete_learning_root )
```
becomes
```ts
await resolveFolder( vaultRootFor( userId ), body.melete_learning_root )
```
`resolveFolder` (`clients/vault.client.ts`) already does what the review screen's save does: parses the path, refuses a path outside the vault (`ValidationError`), `mkdir -p` inside the vault, and re-checks the created path. Nothing else in the function changes: the setting is written and that user's scan clock reset as today.

One new case: a path whose last segment exists as a *file* makes `mkdir` throw `EEXIST` or `ENOTDIR`. `resolveFolder` maps both to `ValidationError( 'A file is in the way of folder "<path>"' )` (400), so the dialog shows it like any other refusal. This is the only change to `resolveFolder`, and it applies to the review screen's save too, where it was a 500 before.

What stays read-only, and keeps `resolveExistingFolder`: `walkSubject`, `listSubjectFolders`, everything in `meleteScan.service.ts`, `meleteGeneration.service.ts` and `meleteReview.service.ts`. Today `resolveFolder` is called only by `writeNote` inside `vault.client.ts` (the job save goes through `writeNote`); `settings.service.ts` becomes its first and only importer outside that file. A guard test asserts exactly that: no module other than `settings.service.ts` imports `resolveFolder`, and no module under `melete/` or `services/melete*.ts` imports it.

### 3.2 Web
`LearningRootSetup` already passes the picker's value, including a new folder's path, to `updateSettings`. No code change. Its unit test gains a case: choosing a new folder sends that path. The e2e `melete.spec.ts` sets the learning root through **New folder** instead of (or as well as) an existing folder and then asserts the folder exists in the e2e vault.

## 4. Unreadable folders

### 4.1 Which errors count
A read of a folder or note is **skippable** when its error code is `EACCES`, `EPERM`, `ENOENT`, `ENOTDIR` or `ELOOP`: no permission, gone or changed since it was listed, or a symlink cycle. Anything else (`EIO`, `EMFILE`, `ENAMETOOLONG`, …) is a real fault and propagates as today. One predicate, `isSkippable( error ): boolean` in `clients/vault.client.ts` (new, exported), used by both walkers; `meleteScan.service.ts`'s private `isGone` keeps its narrower meaning for a note removed between walk and read.

The **root** of a walk is never skipped: `listFolderTree`'s first `readdir` and `resolveExistingFolder` for the learning root and each subject propagate their errors as today (the missing vault is already a 409 through `vaultRootFor`). Only entries *below* the root are skipped.

### 4.2 Folder picker (`clients/vault.client.ts`, `services/vault.service.ts`)
```ts
listFolderTree( vaultPath, relativeFolder = '', onSkip?: ( path: string, code: string ) => void ): Promise< FolderNode[] >
```
The recursive call wraps its `readdir` in a try/catch: a skippable error calls `onSkip( path, code )` and returns `[]` for that node's children; the node itself is still listed when its parent could read its name, so the user sees the folder but not inside it. A skippable error from an inner recursion is caught at the level that failed, so one bad folder costs only its own subtree. Same codes as §4.1.

`listFolders( userId )` passes an `onSkip` that logs
```ts
logger.warn( { user_id: userId, path, code }, 'Skipped a vault folder that could not be read' )
```
one line per skipped folder, path only (ADR 0049). The response shape `ListFoldersResponse` is unchanged; the picker needs no change.

### 4.3 Scan walk (`melete/scan.ts`)
`walkSubject` returns `{ files: ScannedFile[], skipped: string[] }` instead of `ScannedFile[]`. Inside `walk`, the `readdir` of a *subdirectory* is wrapped: a skippable error pushes the directory's vault-relative path onto `skipped` and continues with the next entry. The `stat` of a candidate `.md` file is wrapped the same way, pushing the file's path. The root (`start`) still throws. `MAX_FILES_PER_SCAN` is unchanged.

`listSubjectFolders` is unchanged: the learning root's own `readdir` is the root of that walk, and a subject folder that can't be entered is found by `walkSubject` (`resolveExistingFolder` on it fails with `EACCES` → that subject's whole folder is one skipped path and its walk yields no files). So `runScan` wraps the `walkSubject` call: a skippable error for the subject folder itself records `subjectFolder` as skipped and moves on.

### 4.4 Scan reconciliation (`services/meleteScan.service.ts`)
- `readNote` returns `null` for `isGone` as today, and for the other skippable codes (`EACCES`, `EPERM`, `ELOOP`) it returns a new sentinel so the caller can record the path: change the return type to `ReadFile | 'gone' | 'unreadable'` (or an equivalent discriminated result). `runScan` pushes an unreadable note's path onto `skipped`; a gone note is handled as today.
- `runScan` collects `skipped` from every subject walk and every unreadable note, de-duplicates and sorts it, and passes it to `applyScan( userId, learningRoot, subjectFolders, seen, changed, skipped, now )`.
- `applyScan` gets one helper, `underSkipped( path ) = skipped.some( ( p ) => path === p || path.startsWith( p + '/' ) )`, and applies it in two places:
  - the final loop that marks notes missing skips any note with `underSkipped( note.path )`;
  - `movedFrom`'s candidate filter excludes notes with `underSkipped( note.path )`, so an unreadable note can't be "moved" to a new file that happens to share its body hash.
  Nothing else in `applyScan` changes: notes the walk *did* read under a partially skipped subject are updated as today; arrivals are inserted as today.
- `runScan` ends with `rememberSkipped( userId, skipped )` (§4.5) and, when `skipped` is not empty, one log line: `logger.warn( { user_id, learning_root, skipped_count, skipped }, 'Scan skipped paths it could not read' )` (paths only).
- A fresh (30-second) scan that doesn't run leaves the remembered list as it was; a scan that runs replaces it, so the list always describes the last real walk.

### 4.5 Remembering the last scan (`melete/scanOutcome.ts`, new)
A per-user `Map< string, string[] >` beside the scan clock: `rememberSkipped( userId, paths )`, `lastSkipped( userId ): string[]` (a copy, `[]` when none), and `resetScanOutcome( userId? )`. `resetScanClock` does *not* reset it (a changed learning root triggers a forced scan that overwrites it anyway); tests reset both. In memory only: it is advisory, per process, and refreshed by the next scan — no table, no schema change.

### 4.6 `GET /api/melete/today` (`services/melete.service.ts`)
`getToday` adds `skipped_paths: lastSkipped( userId )` to its response, in both branches (`[]` when there is no learning root). Nothing else in the Melete routes changes.

### 4.7 Web (`components/MeleteToday`)
When `today.skipped_paths.length > 0`, render an MUI `Alert severity="warning"` above the subjects: "Melete couldn't read *n* folders or notes in your vault" with the paths as a compact list (an `AlertTitle` plus a `<ul>` or comma-joined `Typography`; collapse behind a **Show** toggle when more than 5). No colour-only signal. `test-support/melete.fixture.ts` gets `skipped_paths: []` on every `GetMeleteTodayResponse` fixture; one browser test (phone and desktop, light and dark, no sideways scroll with a long path).

## 5. Obsidian link per user

### 5.1 Server
- `services/vault.service.ts` gains `vaultDirFor( userId ): string | null` (the user's `vault_dir` or `null`, no `lstat`; a missing-but-named vault still yields its name, since the link is harmless).
- `services/melete.service.ts` (`toMeleteNote` or where `obsidian_url` is set today, line ~105) and `services/meleteReview.service.ts` (line ~147) call `obsidianUrl( vaultDirFor( userId ), note.path )`. `melete/obsidian.ts` is unchanged: a `null` name still gives `obsidian_url: null`, which now only happens for a user without a vault (who can't reach Melete anyway).
- `config.ts`: `OBSIDIAN_VAULT_NAME` leaves the schema and `config.obsidianVaultName` is removed; `'OBSIDIAN_VAULT_NAME'` joins `IGNORED_VARIABLES`, so `server.ts` logs the existing "ignored" warning for a leftover line. `config.test.ts` updated accordingly.
- `.env.example` (root and `apps/server`), README (variables table, the phone step, the Melete variables note, the troubleshooting entry "There is no Open in Obsidian button"), `apps/server/CLAUDE.md` (env list) and the e2e Compose override if it sets the variable.

### 5.2 Why the folder name is enough
`users.vault_dir` is a folder directly under `VAULTS_PATH` (ADR 0063) and `melete_notes.path` is relative to that folder, so `obsidian://open?vault=<vault_dir>&file=<path>` is exactly Obsidian's own addressing when the person opened that folder as a vault. A person who opens a *parent* folder as their vault gets a link to a vault Obsidian doesn't know; that case is out of scope (PRD §8).

## 6. Logs (ADR 0049)
Two new `warn` lines, §4.2 and §4.4. Both carry `user_id` and vault-relative paths; neither carries note text or the absolute host path.

## 7. Docs
- `docs/decisions/0072-learning-root-created-on-save.md` (written with this TRD) and its row in `docs/README.md`; ADR 0054's status becomes "Accepted (amended by 0072)".
- Root `CLAUDE.md`: the Melete sentence "**Melete never writes to the vault**" gains "(except the empty learning-root folder a user creates from Settings, ADR 0072)"; the Obsidian link mention, if any, loses the variable. `apps/server/CLAUDE.md`: env list, `scan.ts` and `vault.client.ts` descriptions. `apps/web/CLAUDE.md`: `MeleteToday` notice.
- README: §5.1's edits plus two troubleshooting entries: "A folder is missing from the folder picker" (check its permissions; the server log names it) and "Melete says it couldn't read some folders".
- `docs/v0.9.1/release-notes.md` from §10.

## 8. Testing

### 8.1 Server
- **Permission tests** create a temporary vault, `chmod 000` one subfolder (and, separately, one `.md` file), run the walk, then `chmod 755` it back in `afterEach` so the temp dir can be removed. They are skipped when `process.getuid?.() === 0`, the pattern already in `vault.client.test.ts` (`isRoot`), because root ignores permission bits. The `ENOENT` and `ENOTDIR` cases need no permissions: remove or replace the folder after a stubbed first `readdir`, or point the walk at a path whose directory entry is a file.
- `vault.client.test.ts`: `listFolderTree` lists the readable siblings, calls `onSkip` once with the path and code, and still throws for an unreadable root; `isSkippable` for each code; `resolveFolder` with a file in the way → 400.
- `settings.service.test.ts` and `settings.routes.test.ts`: a new learning root is created and set; a file in the way is a 400; a path outside the vault is a 400; the previous "doesn't exist" expectation flips.
- `scan.test.ts`: `walkSubject` returns `{ files, skipped }`; an unreadable subdirectory is one skipped path and its siblings are read; an unreadable file is skipped; the root still throws.
- `meleteScan.service.test.ts`: notes under a skipped folder keep `missing_at = null`, their enrolment and questions; a note with the same hash as an arrival is not treated as moved when it is under a skipped path; readable notes in the same subject are still updated; `lastSkipped` reflects the last real scan and is unchanged by a fresh skip.
- `melete.service.test.ts` / `melete.routes.test.ts`: `skipped_paths` in `/today`, `[]` without a learning root; `obsidian_url` uses the user's `vault_dir`, and two users get two different links for the same note path.
- `config.test.ts`: `OBSIDIAN_VAULT_NAME` is ignored and reported.
- A guard test for `resolveFolder`'s importers (§3.1): only `settings.service.ts`, never a Melete module.
- Existing tests change only where this TRD changes a signature or a message: `walkSubject`'s return shape, `applyScan`'s parameters, the learning-root "doesn't exist" expectation, the `obsidianVaultName` config mock, and the shared fixtures. List each changed file in the log line.

### 8.2 Shared
`melete.test.ts`: `skipped_paths` required, array of strings, the fixtures.

### 8.3 Web
`MeleteToday` unit test for the notice (none, one, many) and the browser test in §4.7; `LearningRootSetup` test from §3.2. Fixtures gain `skipped_paths: []`.

### 8.4 e2e (ADR 0053)
`melete.spec.ts` creates the learning root with **New folder** and asserts the folder exists under the e2e vault. The unreadable-folder cases are unit-only: the e2e container runs as root, where `chmod` proves nothing. `pnpm e2e` runs at the end of **both** checkpoints (the root `CLAUDE.md` says from F on; a two-checkpoint patch runs it each time).

## 9. Checkpoints (for `tasks.md`)
- **A — learning root and Obsidian link:** Phase 1 kick-off (version 0.9.1, docs index), Phase 2 learning root (§3), Phase 3 Obsidian link (§5).
- **B — unreadable folders, docs and release:** Phase 4 picker (§4.1–4.2), Phase 5 scan (§4.3–4.7, with the shared contract first), Phase 6 docs, release notes, final checks and manual checks.

## 10. Upgrade (release notes)
1. Pull, `docker compose build`, `docker compose up -d`. No database change: the app starts on the 0.9.0 database as it is, and no backup copy is made.
2. Delete the `OBSIDIAN_VAULT_NAME` line from `.env` (a leftover is ignored with a warning). The Obsidian link now works for every user with nothing set.
3. Manual checks with Naresh: in Settings → Melete, choose a learning root through **New folder** and see it in the vault; `chmod 000` a subfolder of a vault, open the folder picker (folder absent, warning in `docker compose logs`) and the Melete page (notice listing it; notes under it still reviewable), then `chmod 755` it back and see the notice clear on the next scan; as both users, **Open in Obsidian** opens the right vault.
