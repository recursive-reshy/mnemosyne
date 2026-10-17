# Plan — Checkpoint A (Phases 1–3: kick-off, contracts, data), tasks 1.1–3.4

## Context
v0.4.0 puts the summarizer prompt, profiles and model under UI control (ADRs 0027–0029). Checkpoint A is the foundation: ADRs accepted, shared contracts, then the server data layer (database module, prompt constants, migration 4, repositories). No behaviour changes yet; the app keeps summarizing exactly as in 0.3.1 (new job columns are NULL).

Every task: failing tests first (watch them fail for the right reason) → least code → refactor → tick Status + log line in `tasks.md` → commit (`feat(<id>): …`) → push. After each: `pnpm test`, `pnpm lint`, `pnpm typecheck` in every touched package (shared, server, and web for 2.2). No new dependencies.

Findings from reading the code:
- Inline code round-trips through the editor: fixture `'rule, inline code and a code block'` is in the "keeps exactly" group in `noteRoundTrip.test.tsx`. So TRD §5.1's fallback is not needed for backticks. Bold lead-ins: fixtures contain bold, but I'll confirm `- **X:** text` in a list item in 3.2 (see below).
- `openJobStore`/`closeJobStore`/`jobStoreMigrations` are used in `server.ts`, `jobStore.repository.ts` and its test, `test-support/jobStore.setup.ts`, `vitest.config.ts`, `vitest.integration.config.ts`, `apps/server/CLAUDE.md`. `shutdown.ts` receives `closeStore` as an option (wired in `server.ts`), so it needs no code change.
- Job fixtures/refs to update for 2.2: server `jobStore.repository.ts`, `jobs.service.ts`, `jobs.controller.ts`, tests (`jobs.service.test.ts`, `jobs.routes.test.ts`, repository test); web `test-support/job.fixture.ts`, `api/jobs.api.ts`, `JobPage.tsx` and tests. `shared/api.ts` holds `CreateJobBody`.

## 1.1 Kick-off (docs only, no tests)
- ADRs 0027, 0028, 0029: `Status: Proposed` → `Accepted`.
- `docs/README.md`: rows 0027–0029 → Accepted; row 0014 → "Accepted (amended by 0027, 0028)". Also state 0.4.0 as current version if the index doesn't already.
- `docs/decisions/0014-claude-summarizer.md`: Status → `Accepted (amended by 0027, 0028)`.
- Commit `docs(1.1): ADRs 0027–0029 accepted`.

## 2.1 Shared `summarizer.ts` (TRD §3)
- Test first: `packages/shared/src/summarizer.test.ts`, valid/invalid cases per schema: `ModelOption`, `ListModelsResponse` (source enum), `Settings` (uuid), `UpdateSettingsBody` (at-least-one refinement; empty `{}` rejected), `Guidance` (trims, rejects empty/whitespace, accepts 20,000, rejects 20,001), `ProfileName` (trim, 1–60), `PromptVersionSource`, `PromptVersion`, `PromptProfile`, create/rename/save bodies, `SummaryRun`, `SummaryUsage` (null cost), `RegenerateSummaryBody` (both optional, `{}` valid). Red: module missing.
- Green: `packages/shared/src/summarizer.ts` with the TRD §3 shapes, `Response`/`Body` schemas plus inferred types (same style as `job.ts`/`api.ts`); `export * from './summarizer.js'` in `index.ts`.
- Update `packages/shared/CLAUDE.md` file list if it lists files.

## 2.2 `CreateJobBody` and `Job` gain fields
- Tests first (red): `api.test.ts` — `CreateJobBody` accepts optional `model` (min 1) and `profile_id` (uuid), rejects empty model/bad uuid; `job.test.ts` — `Job` requires `summary_model`, `prompt_profile_id` (nullable) and `summary_usage` (nullable `SummaryUsage`).
- Green: edit `api.ts` and `job.ts` (import `SummaryUsage` from `summarizer.ts`; check for no circular import).
- Then typecheck both apps and fix every reference: server `StoredJob`/`toPublicJob` etc. return `summary_model: null`, `prompt_profile_id: null`, `summary_usage: null` (the DB columns arrive in 3.3/3.4; for 2.2 `toPublicJob` hardcodes null for `summary_usage` and passes through nothing else — repository adds the two columns in 3.4, so in 2.2 `StoredJob` rows are built with null defaults in `toStoredJob`); web `job.fixture.ts` and any literal `Job` objects gain the fields. Existing tests unchanged except fixtures/literals that must carry the new fields; list each in the log line.

## 3.1 `repositories/database.ts` (refactor only)
- Move from `jobStore.repository.ts`: `Migration` type, migration list (renamed `migrations`), `runMigrations`, connection. New exports: `openDatabase( path )`, `closeDatabase()`, `getDatabase()` (throws `'Database is not open'`, replacing `requireDatabase`'s `'Job store is not open'`).
- Move the tests with the code: new `database.test.ts` takes the `openJobStore and closeJobStore`, `runMigrations`, `migration 2`, `migration 3` and `storage` describe blocks, with names changed and the error-message assertion updated. Job-query tests stay in `jobStore.repository.test.ts`. Expected red: new test file imports a missing module; then move code → green. Existing assertions are unchanged apart from renamed functions (and the one error message string; flagged in the log).
- `git mv` `test-support/jobStore.setup.ts` → `database.setup.ts`; update `vitest.config.ts`, `vitest.integration.config.ts`, `server.ts` (`openDatabase`, `closeStore: closeDatabase`). `jobStore.repository.ts` imports `getDatabase` and keeps only job queries (the `addNoteColumns` migration function moves too, with its imports).
- `apps/server/CLAUDE.md`: setup file name and `openDatabase`/`closeDatabase` in the Layers line.

## 3.2 `summarizer/prompts.ts`
- First, a tiny check that `- **Lead-in:** text` bullets round-trip: add a fixture `'bold lead-ins in a list'` to `apps/web/src/test-support/noteFixtures.ts`; the existing `it.each` tests then run it (idempotent and exact). If it fails, apply TRD §5.1 (use paragraphs/other form) and note it in the log; the Business/Coding guidance text asks for "bold lead-in followed by a short paragraph or list", so that's the shape to verify. (Inline code is already covered, so the backticks hint stays.) This touches web test fixtures only; it runs `apps/web` tests.
- Test first: `prompts.test.ts` — `LOCKED_INSTRUCTIONS` equals the TRD §5.1 text exactly; `SEEDED_PROFILES` has `business`, `coding`, `general` in that order with names "Business ideas", "Coding", "General" and guidance equal to TRD §5.3; every seeded guidance passes `Guidance`; `buildSystemPrompt( 'x' )` equals `` `${LOCKED}\n\n<guidance>\nx\n</guidance>` `` exactly. Red: module missing.
- Green: constants copied verbatim from the TRD (template literals/line arrays), `buildSystemPrompt`.

## 3.3 Migration 4
- In `database.ts`, append a function migration creating `settings`, `prompt_profiles` (+ partial unique index on `lower(name)`), `prompt_versions`, `summary_runs` (+ index), `ALTER TABLE jobs ADD COLUMN summary_model / prompt_profile_id` (TRD §2.2); then seed the three profiles (uuid via `crypto.randomUUID()`, `created_at` now) each with version 1 `source 'seed'`, and `settings.default_profile_id` = the Business profile id as JSON.
- Tests first (in `database.test.ts`, "migration 4"): (a) database built to `user_version = 3` with a `ready_for_review` job → after migrating: version 4, note/`note_markdown` byte-identical, new job columns NULL, 3 profiles with the right names/seed keys, each with one version-1 `seed` row matching `SEEDED_PROFILES`, `default_profile_id` setting points at the `business` profile, no `default_model` row; (b) from empty → `user_version` 4 with all tables; (c) unique active-name index rejects a case-differing duplicate, allows reuse after `deleted_at` set; (d) `UNIQUE( profile_id, version )`. Red: version stays 3.
- Green: write the migration.

## 3.4 Repositories + job columns
- Tests first, one file each: `settings.repository.test.ts` (`getSetting` undefined when absent, `setSetting` upserts, JSON round-trip); `promptProfiles.repository.test.ts` (list active excludes deleted, ordered by name; `findProfileById` returns deleted; insert/rename/markDeleted; duplicate active name → typed conflict result, not a throw; deleted name reusable; `countActiveProfiles`; `insertVersion` assigns max+1 per profile independently across profiles; `findLatestVersion`, `listVersions` newest first, `findVersionById`); `summaryRuns.repository.test.ts` (insert, list oldest first per job, nullable token/cost fields, runs survive `deleteJob`); `jobStore.repository.test.ts` additions (insert/update/find round-trip `summary_model` and `prompt_profile_id`; defaults NULL). Red: modules missing / fields dropped.
- Green: the three repositories as synchronous free functions on `getDatabase()` with Zod-parsed rows (TRD §2.3); `insertVersion` in a transaction; `jobStore.repository.ts` `JobRow`, `toRow`, INSERT and UPDATE gain the two columns; `StoredJob` (from `Job`) now has them via 2.2.
- `apps/server/CLAUDE.md`: repositories line becomes "the SQLite database (jobs, settings, prompts, summary runs), and nothing else"; folder-structure line for `database.ts`.

## Critical files
- New: `packages/shared/src/summarizer.ts(+test)`, `apps/server/src/repositories/{database,settings.repository,promptProfiles.repository,summaryRuns.repository}.ts` (+ tests), `apps/server/src/summarizer/prompts.ts(+test)`, `test-support/database.setup.ts` (renamed).
- Edit: `packages/shared/src/{index,api,job}.ts`, `apps/server/src/{server.ts,repositories/jobStore.repository.ts,services/jobs.service.ts,controllers/jobs.controller.ts}`, both vitest configs, `apps/server/CLAUDE.md`, web `test-support/job.fixture.ts` and `noteFixtures.ts`, docs README/ADRs/`tasks.md`.

## Verification
Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in shared and server (and web after 2.2 and 3.2). End of checkpoint: the same for all three packages plus `pnpm build` for server; migration 4 test covers the real upgrade path from `user_version = 3`. Report: tasks with commit hashes, results per package, ADRs (none new expected; none change the TRD), and the changed existing tests (renamed DB functions, error message string, Job fixtures).

## Open point to flag
`Job` gains `summary_usage` in 2.2 but runs only exist from 3.4; `toPublicJob` returns `null` until 4.5 builds it. This matches the TRD ("null until the first attempt").
