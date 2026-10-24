# Checkpoint A plan: Phases 1–2 (kick-off, contracts and baseline)

## Context
v0.9.0 makes Mnemosyne multi-user (ADRs 0061–0068). Checkpoint A is the groundwork and changes nothing user-visible: accept the ADRs, add the shared auth/admin/settings-key/health-kind contracts, collapse migrations 1–9 into a baseline that adds `users`, `user_modules`, `sessions` and `app_settings`, add the set-aside and pre-migration backup logic, and add the two guard tests. Order is fixed: 1.1 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5. After each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in every folder touched (shared, server; web typecheck/tests where fixtures change), tick Status, add a log line, commit (`feat(0.9-<id>): …`), push. `pnpm e2e` is not required (starts at F).

## Findings from reading the 0.8.0 code
1. **No seed-marker settings keys exist today.** TRD §2.3 says `UserSettingKey` includes "the seed-marker keys used today", but seed markers live on `prompt_profiles.seed_key`, not in `settings`. `UserSettingKey` is therefore the nine listed keys. `default_profile_id` is the only setting the migration seeded. I'll note this in the 2.2 log line; no TRD edit needed.
2. **Baseline source of truth.** Rather than hand-merging nine migrations, I'll build a database with the current migrations, dump `sqlite_master`, and use it as a reference in a test (see 2.3) so the baseline's 0.8 tables match column for column. Final `jobs` columns are listed in `database.test.ts`.
3. **FK enforcement exposes delete order.** Today `foreign_keys` is off and existing FKs (`prompt_versions → prompt_profiles`, `feed_items → feeds`, `melete_* → melete_*`, etc.) are unenforced. Turning it on may break tests/code that delete parents first; 2.3 fixes them and lists each in the log.
4. **`seedDefaults()` (temporary, 2.3).** Runs after migrations inside `openDatabase`, idempotent: reuses the existing `seedProfile` logic (skips by `seed_key`, " (seeded)" name suffix) for all `SEEDED_PROFILES`, the linker, and the two Melete profiles, and writes `default_profile_id` (business) only if absent. Keeps every existing test's seeded profiles. Deleted in 3.2 (replaced by `seedUser`).
5. **Schema numbering.** `migrations = [ baseline ]`, `SCHEMA_BASE = 9`, stored `user_version` after baseline = 10. `runMigrations` currently writes `index + 1`; it must write `SCHEMA_BASE + index + 1` and skip by `applied - SCHEMA_BASE`. `runMigrations( db, migrations )` is exported and used by tests with custom lists; keep its signature, add the base internally.
6. **`:memory:` databases.** Set-aside and pre-migration backup apply only to file databases (nothing to copy for `:memory:`). `openDatabase` needs the backup directory: add an optional second parameter `{ backupDir }` defaulting to `config.backupDir`; check how `config` is imported in the repository layer before deciding (if importing config into `database.ts` is awkward in tests, take the dir as a parameter and have `server.ts` pass it).
7. **`backupName`** lives in `services/backup.service.ts` (Singapore-time timestamp). `database.ts` is a lower layer, so 2.4 moves `backupName` to a small pure module (`repositories/backupName.ts` or `services/backupName.ts`; I'll pick the one that doesn't create a repository → service import) and re-exports it from `backup.service.ts` so existing imports and tests stay unchanged.
8. **Health on set-aside.** TRD §3.6 says both paths record a `backup` health check after the database is open. `recordCheck` is a service needing the DB, so `openDatabase` returns nothing new; instead it returns an `OpenResult` (`{ setAside?: path, preMigration?: path }`) that `server.ts` passes to `recordCheck` after opening. Tests assert the return value; the `recordCheck` call itself is wired in 3.x when `health` gets its user split (4.4). For now `server.ts` logs it at `warn`. **Flag:** this defers the health-row part of TRD §3.6 to 4.4; say so in the log.

## Task 1.1: kick-off docs (no code, no tests)
- ADRs 0061–0068: `Status: Proposed` → `Accepted`.
- `docs/README.md`: rows 0061–0068 → Accepted; 0035 and 0060 "Accepted (amended by 0061)" and 0012 "Accepted (amended by 0066)" (keep any existing amendment text); "current version is 0.8.0" → 0.9.0; v0.9.0 entry "(planned)" → "(in progress)".
- Root `CLAUDE.md`: first paragraph reworded for multi-user (sign-in, per-user vaults under a vaults root, admin). The architecture paragraph is rewritten later in 8.2; the version line already says 0.9.0.
- `tasks.md`: tick 1.1, add a log line. The Plan cell for A is ticked in the plan-approval commit, not here.
- Commit: `docs(0.9-1.1): accept ADRs 0061–0068, mark v0.9.0 in progress`.

## Task 2.1: shared `auth.ts` and `admin.ts`
- **Tests first** (`auth.test.ts`, `admin.test.ts`; red: modules missing): `ModuleId`, `Role`, `UserStatus` enums; `VaultDir` accepts `a`, `naresh`, `my-vault-2`, 40 chars; rejects empty, 41 chars, leading/trailing hyphen, uppercase, dots, slashes, `..`, spaces; `Me` requires uuid id, email, name, role, modules, `vault_dir` nullable; `VaultChoice`, `ClaimVaultBody`, `CreateVaultBody`; `AdminUser` (iso nullable `last_signin_at`); `CreateUserBody` lower-cases email, rejects bad email, name 1–80, modules array; `UpdateUserBody` accepts each field alone, rejects `{}`; `DeleteUserBody`; `UsageCategory`; `UsageTotals` (`cost_usd` nullable); `UserUsage`; `UsageResponse` (month `YYYY-MM`).
- **New** `auth.ts`, `admin.ts` per TRD §2.1–2.2; `export * from './admin.js'` and `'./auth.js'` in `index.ts` (alphabetical).
- Commit: `feat(0.9-2.1): shared auth and admin contracts`.

## Task 2.2: setting keys and health kinds
- **Tests first** (`summarizer.test.ts`, `status.test.ts`; red): `UserSettingKey` has exactly the nine keys, rejects `feed_check_interval_minutes`; `AppSettingKey` is exactly `feed_check_interval_minutes`; `AppHealthKind` = agent/whisper/backup; `UserHealthKind` = feed/gmail_source/gmail_connection; `HealthKind` still parses all six and nothing else.
- **Edit** `summarizer.ts` (add the two enums; `Settings` shape unchanged) and `status.ts` (`HealthKind = z.union`/`z.enum` of both lists; keep it a `z.enum` so existing `.options` and `StatusRow` uses compile).
- **Fallout:** typecheck decides; expected none beyond tests listing keys. Server `getSetting`/`setSetting` keep `string` keys until 3.2 (typed there with `userId`), so 2.2 does not touch server code beyond tests, if any.
- Commit: `feat(0.9-2.2): setting key and health kind enums`.

## Task 2.3: baseline schema
- **Tests first** (`database.test.ts`, red):
  - `migrations.length === 1`, `SCHEMA_BASE === 9`; fresh database `user_version === 10`.
  - Every 0.8 table exists with the same columns as before (reference list captured from today's schema in the test, as literal column lists per table); plus `users`, `user_modules`, `sessions`, `app_settings` and their indexes (`users_one_admin`, `sessions_user`) with the columns in TRD §3.2; the `eligible_users` and `usage_events` views exist (deferred: views reference `user_id` columns that don't exist on run tables until Phase 4, so **views are created in the Phase 4 task that adds the last `user_id` they need**: `eligible_users` now (only needs `users`, `user_modules`), `usage_events` in 4.2/4.3/4.5. Flagged in the log.)
  - One-admin index: two admins rejected; two members fine. `user_modules.module` CHECK; `users.role`/`status` CHECK.
  - `runMigrations` with a test list: versions written as `SCHEMA_BASE + index + 1`; already-applied ones skipped; newer-version refusal compares to `SCHEMA_BASE + migrations.length`.
  - `PRAGMA foreign_keys` is 1 after open; `foreign_key_check` is empty after open.
  - `seedDefaults()`: all profiles present once with version 1 (summary profiles incl. Study, linker, two Melete), `default_profile_id` set to the business profile, idempotent on a second call and does not overwrite a changed `default_profile_id`.
  - Old migration-based tests (v8 → v9 etc.) are deleted with the migrations they exercised; their still-relevant assertions (name clash suffix) move to a `seedDefaults` test.
- **Edit** `database.ts`: delete `addNoteColumns` … `addMelete` and the unused imports; add `baseline` (SQL string; the 0.8 tables copied from the dumped final schema, unchanged, plus the four new tables); `SCHEMA_BASE`; `seedDefaults()` (moved seed code: `seedProfile` plus the business/default-profile logic); `openDatabase` sets `foreign_keys = ON` before migrating (outside the transaction), runs `seedDefaults()` after migrations, then `foreign_key_check`, throwing if it reports rows.
- **Fallout:** with FKs on, run the whole server suite; fix delete/insert order in code or tests the suite exposes (e.g. deleting profiles before versions, fixtures inserting children first) with the smallest change, and list each file in the log line (TRD §11.1 allows this).
- Commit: `feat(0.9-2.3): baseline schema at version 10`.

## Task 2.4: set-aside and pre-migration backups
- **Tests first** (`database.test.ts` or a new `database.open.test.ts`; temp directories, red):
  1. A v9 file (built in the test with `user_version = 9` and a row in a table) is set aside: `pre-0.9-<timestamp>.db` exists in the backup dir, readable, contains the row; the original path (and `-wal`/`-shm`) is gone; the new database is empty at version 10; a `warn` is logged with the copy's path.
  2. Schemas 1–8 behave the same.
  3. Failed copy (backup dir is a file, or unwritable) → `openDatabase` throws, the original file and its data are untouched.
  4. Version above `SCHEMA_BASE + migrations.length` → refuses, file untouched (existing test, updated numbers).
  5. A test-only migration list with a second migration (schema 11): opening a version-10 file creates `pre-migration-v10-to-v11-<timestamp>.db` and then migrates; a failing backup refuses and leaves the file at 10.
  6. Version already current → no backup written. `:memory:` → none.
  7. `foreign_key_check` failure refuses to start (a file at version 10 containing an orphan row, inserted with FKs off).
  The test-only migration list needs `openDatabase` to accept the migrations (internal parameter, default the real list).
- **Edit** `database.ts` per findings 6–8 and TRD §3.3 order: read version → set aside (1–9) → newer-refuse → backup (≥10 and below target) → WAL + FKs → migrate → seedDefaults → `foreign_key_check`. Move `backupName` (finding 7). `server.ts` passes `config.backupDir` and logs the result.
- Commit: `feat(0.9-2.4): set aside old databases and back up before migrating`.

## Task 2.5: schema guard and repository signature guard
- **Tests first / new tests** (these are the deliverable; they pass at the end of this task by design):
  - `database.schema.test.ts`: for every table except `users`, `user_modules`, `sessions`, `app_settings` (and views), checks via `pragma table_info` / `foreign_key_list` that `user_id` is `NOT NULL` with `ON DELETE CASCADE` to `users`; `health_status`/`health_errors` nullable with the CHECK. It holds `UNCONVERTED` = every data table (all of them, per the tasks table); tables on the list are skipped. Two further assertions keep the list honest: every name on the list is a real table, and (the end-of-Phase-4 assertion) a test `it.todo`-free check that `UNCONVERTED` is empty is written now as `it.skip` with a comment pointing to 4.6, which un-skips it.
  - `repositories/signature.guard.test.ts`: imports every `*.repository.ts` except `system`, `users`, `sessions`, `appSettings` (via `import.meta.glob` or a static list; static list is simpler and visible), and for each exported function checks the first parameter name is `userId` using `Function.prototype.toString`. Starts with an `UNCONVERTED` list of all current data repositories, shrinking per Phase 4 task; names must be real files.
- No production code changes.
- Commit: `test(0.9-2.5): schema and signature guards`.

## Verification (end of checkpoint)
- `pnpm test`, `pnpm lint`, `pnpm typecheck` in `packages/shared`, `apps/server`; `apps/web` typecheck/test only if shared changes break it (expected not); agent untouched.
- Manual: start the server against a copy of a real 0.8 database (file path set via `DATA_DIR`) and confirm the set-aside file appears in the backups folder and the app starts empty — logged, not committed.
- Report per CLAUDE.md "Before you stop": tasks with hashes, results per folder, ADRs (none new; none change the TRD), deferrals (health row for set-aside → 4.4; `usage_events` view timing; no seed-marker keys).

## Questions for Naresh
None blocking. Two judgment calls to confirm by approving: (a) the `usage_events` view is created in Phase 4 rather than in the 2.3 baseline, because it needs `user_id` on the run tables; (b) the backup health row for a set-aside is wired in 4.4, with 2.4 only logging it.
