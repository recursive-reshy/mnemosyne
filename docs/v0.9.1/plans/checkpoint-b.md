# Checkpoint B plan: Phases 4–6 (unreadable folders, docs and release)

Saved on approval to `docs/v0.9.1/plans/checkpoint-b.md`; tick the Plan cell in `tasks.md`; commit `docs(0.9.1-plan): checkpoint B`; push; then start 4.1.

## Context
0.9.1 is a patch: no schema change, no new dependency, no new endpoint. Checkpoint A (learning root on save, per-user Obsidian link) is done. Checkpoint B makes one unreadable folder stop breaking the folder picker and the Melete scan (TRD §4), then closes the release with docs and final checks. ADRs read: 0049 (logs), 0057 (scan), 0072.

Commit per task: `feat(0.9.1-<id>): …`, with the `tasks.md` tick and log line, then push. After each task run test, lint and typecheck for the folders touched. Co-Authored-By per the session attribution. Permission tests use a temp vault, `chmod 000`, restore in `afterEach`, and `it.skipIf( isRoot )` (pattern at `vault.client.test.ts:36`).

## 4.1 Folder picker skips unreadable folders (ADR 0049)
Tests first (red before code):
- `vault.client.test.ts`: `isSkippable` true for `EACCES`, `EPERM`, `ENOENT`, `ENOTDIR`, `ELOOP`; false for `EIO`, `EMFILE`, a non-errno error. `listFolderTree` with a `chmod 000` subfolder lists the readable siblings, keeps the bad folder as a node with `children: []`, calls `onSkip( path, code )` once; a nested bad folder costs only its subtree; an unreadable root still throws (existing test at :116 stays).
- `vault.service.test.ts`: `listFolders` logs one `warn` per skipped folder with `{ user_id, path, code }` and message `Skipped a vault folder that could not be read` (spy on `logger.warn`); no absolute host path in the fields.
Code:
- `clients/vault.client.ts`: export `isSkippable( error: unknown ): boolean`. `listFolderTree( vaultPath, relativeFolder = '', onSkip? )`: the root call's `readdir` is not caught; the recursive call for each child catches a skippable error, calls `onSkip`, and returns `[]` for that child's children. Implement by splitting the recursion into an inner function so only entries below the root are guarded.
- `services/vault.service.ts` `listFolders`: pass the logging `onSkip`; import `logger`.
Red → green: new tests fail on missing export / uncaught `EACCES`; pass after.

## 5.1 Shared contract, one commit across packages
Tests first: `packages/shared/src/melete.test.ts`: `GetMeleteTodayResponse` rejects a missing `skipped_paths`, rejects non-strings, accepts `[]` and paths.
Code: `packages/shared/src/melete.ts` adds required `skipped_paths: z.array( z.string() )`. Then make every builder of the response compile: `apps/server/src/services/melete.service.ts` `getToday` (both branches get `skipped_paths: []` for now; real value in 5.3), and fixtures/literals in `apps/server/src/routes/melete.routes.test.ts`, `melete.isolation.routes.test.ts`, `melete.service.test.ts`, `apps/web/src/test-support/melete.fixture.ts`, `MeleteToday.test.tsx`, and `apps/web` code that builds the type if any (`hooks/useMeleteToday.ts`, `api/melete.api.ts` only pass it through; check by typecheck). Lists changed files in the log line.
Red → green: shared test red, then typecheck of shared/server/web drives the fixture fixes; all three packages green.

## 5.2 Scan skips and protects notes (ADRs 0049, 0057)
Tests first:
- `scan.test.ts`: `walkSubject` returns `{ files, skipped }`; unreadable subdirectory → its vault-relative path in `skipped`, siblings still read; unreadable `.md` (stat fails) → its path skipped; unreadable start folder still throws. Existing tests change from array to `.files` (list in log).
- `scanOutcome.test.ts` (new): `rememberSkipped` / `lastSkipped` (returns a copy, `[]` when none, per user) / `resetScanOutcome( userId? )`; `resetScanClock` leaves it alone.
- `meleteScan.service.test.ts`: (a) notes under a `chmod 000` folder keep `missing_at = null`, enrolment and active questions; (b) readable notes in the same subject still update; (c) a skipped note with the same body hash as an arrival is not treated as moved (arrival inserted, skipped note untouched); (d) a subject folder that can't be entered counts as one skipped path and its notes keep state; (e) an unreadable note file (`EACCES` on read) is skipped via the `'unreadable'` result; (f) after `chmod 755` and a forced scan, `lastSkipped` is `[]`; a fresh (within 30 s) scan that doesn't run leaves the remembered list unchanged; (g) one `warn` line `Scan skipped paths it could not read` with `user_id`, `learning_root`, `skipped_count`, `skipped`, only when non-empty.
Code:
- `melete/scan.ts`: `walkSubject` returns `{ files, skipped }`; in `walk`, wrap each subdirectory `readdir` and each candidate `stat` with `isSkippable` (imported from `vault.client.ts`), pushing the relative path; the start folder's `readdir` still propagates.
- `melete/scanOutcome.ts` (new): a per-user `Map`, three functions, comment on why in memory only.
- `services/meleteScan.service.ts`: `readNote` returns `ReadFile | 'gone' | 'unreadable'` (`isGone` unchanged; `EACCES`/`EPERM`/`ELOOP` → `'unreadable'`; anything else rethrows); `runScan` wraps `walkSubject` per subject so a skippable error from entering the subject folder records `subjectFolder` as skipped, gathers skipped paths from walks and unreadable notes, de-duplicates and sorts, passes them to `applyScan( userId, learningRoot, subjectFolders, seen, changed, skipped, now )`, then calls `rememberSkipped` and logs the warn line. `applyScan` gets `underSkipped( path )`, used in the missing loop and in `movedFrom`'s candidate filter. Remember happens only when the scan runs (the fresh-scan early return in `scanLearningRoot` is untouched). Note: the transaction still wraps `applyScan` only.
Red → green: tests fail on the old return shape / notes flipping to missing; pass after. Watch for `walkSubject` callers (only `runScan`).

## 5.3 `getToday` and the Melete page (ADR 0057)
Tests first:
- `melete.service.test.ts` and `melete.routes.test.ts`: `/today` returns the last scan's `skipped_paths` (seed with `rememberSkipped`), `[]` with no learning root and with no scan yet; a user's list doesn't appear for another user.
- `MeleteToday.test.tsx`: no notice for `[]`; one path → warning alert, title "Melete couldn't read 1 folder or note in your vault", the path; many (≤5) all listed; more than 5 collapsed behind a **Show** toggle that reveals them; not colour-only (alert has text and icon).
- One browser test `MeleteToday.browser.test.tsx` (pattern from the existing browser tests): phone and desktop widths, light and dark, a long path, assert no horizontal page scroll (`scrollWidth <= clientWidth`) and take screenshots for the report.
Code:
- `services/melete.service.ts` `getToday`: `skipped_paths: lastSkipped( userId )` in both branches, after `scanLearningRoot` so a fresh scan's result is what's read.
- `components/MeleteToday/MeleteToday.tsx`: MUI `Alert severity="warning"` + `AlertTitle` above the subjects, a `<ul>` of paths with `overflow-wrap: anywhere`, **Show**/**Hide** toggle when more than 5. `test-support/melete.fixture.ts` already has `skipped_paths: []` from 5.1.
- `apps/web/CLAUDE.md`: note the `MeleteToday` notice.
Red → green: service/route tests red on missing field value, component tests red on no notice; green after.

## 6.1 Docs
- Root `CLAUDE.md`: "**Melete never writes to the vault**" gains "(except the empty learning-root folder a user creates from Settings, ADR 0072)"; mention that the scan skips unreadable folders and the Melete page lists them; Obsidian link mention loses the variable if present; version already 0.9.1.
- `apps/server/CLAUDE.md`: `scan.ts` (returns `{ files, skipped }`), `scanOutcome.ts`, `vault.client.ts` (`isSkippable`, `listFolderTree` `onSkip`), ADR list (add 0072).
- README troubleshooting: "A folder is missing from the folder picker" (permissions; the server log names it) and "Melete says it couldn't read some folders".
- `docs/v0.9.1/release-notes.md` from TRD §10 (what changed, upgrade steps, `OBSIDIAN_VAULT_NAME` removal, closed 0.9.0 known issue, manual checks); link from `docs/README.md` and mark the v0.9.1 entry "done"; ADR 0054's status line "Accepted (amended by 0072)" if not already set (check first).
- No tests; verify by grep that docs mention no removed names.

## 6.2 Final checks
Run in order: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` in server, web, shared; `pnpm test:browser` in web; agent tests (`uv run pytest` in `apps/agent`); `pnpm e2e` (needs Docker); `docker compose build`. Fix failures in new commits. Tick 6.2 only for the automated part; the manual checks with Naresh (TRD §10 step 3: New folder learning root; `chmod 000` subfolder absent from picker with log warning, listed in the Melete notice with notes reviewable, notice gone after `chmod 755` and next scan; Open in Obsidian as both users) are listed in the report as pending his confirmation, and 6.2 stays 🟨 until he reports.

## Checkpoint report
Tasks with commit hashes; test, lint, typecheck, build per folder, `test:browser`, light/dark and phone screenshots of the Melete notice, `pnpm e2e`; ADR 0072 amends ADR 0054 / TRD §7 (no new ADRs expected); deferred: e2e cannot cover unreadable folders (container runs as root, TRD §8.4); the skipped list is in memory only, so a server restart shows no notice until the next scan.

## Open points (none blocking)
- `lastSkipped` is read after `scanLearningRoot` in `getToday`; if a scan is in flight for another request, `getToday` awaits it, so the list is current.
