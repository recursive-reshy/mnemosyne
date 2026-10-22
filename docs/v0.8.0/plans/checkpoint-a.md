# Checkpoint A plan: Phases 1–2 (kick-off, contracts and data)

## Context
v0.8.0 adds Melete (PRD, TRD, ADRs 0054–0060). Checkpoint A is the groundwork: accept the ADRs, add the shared contracts, add migration 9 with the Melete tables and seeded profiles, and add the repositories. No routes, services or UI yet, so nothing user-visible changes. Order is fixed: 1.1 → 2.1 → 2.2 → 2.3 → 2.4. After each task run `pnpm test`, `pnpm lint`, `pnpm typecheck` in every folder touched (`packages/shared`, `apps/server`; `apps/web` typecheck/tests in 2.2 because fixtures change), then tick Status, add a log line, commit, push. `pnpm e2e` is not required (it starts at checkpoint F).

## Findings from reading the 0.7.1 code (decide in the tasks below)
1. **Study is added to `SEEDED_PROFILES` only in task 6.1**, but 2.3 must write the Study text in `summarizer/prompts.ts`. Plan: 2.3 exports `STUDY_GUIDANCE` (TRD §8 text) and a `STUDY_SEED_KEY`; 6.1 will put it in `SEEDED_PROFILES`. Migration 9 inserts Study with `STUDY_GUIDANCE` unless a profile with seed key `study` exists, so it is correct whether or not 6.1 has landed. (Migration 4 uses `SEEDED_PROFILES` live, so once 6.1 lands a fresh database gets Study at migration 4 and migration 9 skips it; this is why the "unless seed key exists" guard matters.)
2. **Name clash is wider than Study.** `prompt_profiles_active_name` is a unique index on `lower(name)` across all purposes. TRD §3.1 covers "Study (seeded)" only. I'll apply the same rule to "Melete questions" and "Melete grading" (suffix " (seeded)") so migration 9 can never abort on a user profile with that name. Small extension of the TRD; I'll mention it in the log line.
3. **`SeedKey` type** is `'business' | 'coding' | 'general'` in `summarizer/prompts.ts` (server), but TRD §2.2 says shared `SeedKey` gains `'study'`. There is no `SeedKey` in `packages/shared/src/summarizer.ts` today. Plan: add `'study'` to the server's `SeedKey` in 2.3 and not invent a shared one. **Stop-and-ask item:** if you want a shared `SeedKey`, say so; otherwise I'll treat the TRD wording as the server type.
4. **`ProfilePurpose`** (server repository enum `summary | linker`) gains `melete_questions | melete_grading` in 2.4. `PromptProfile.purpose` in shared (2.2) uses the same four values.
5. **Existing tests that list things** (allowed by TRD §13.1, each to be named in its log line): `database.test.ts` (migration count / user_version), settings and prompt-profile tests with full `Settings` / `PromptProfile` objects, `GetSettingsResponse` fixtures in shared and web, `Job` fixtures (add `default_folder`). I'll find them by typecheck failures, not by guessing.
6. **`ts-fsrs` is not added in this checkpoint** (first used in 5.1).

## Task 1.1: kick-off docs (no code, no tests)
- ADRs 0054–0060: `Status: Proposed` → `Accepted`.
- `docs/README.md`: index rows 0054–0060 → Accepted; "current version is 0.7.1" → 0.8.0; v0.8.0 entry "(planned)" → "(in progress)".
- Root `CLAUDE.md` already says 0.8.0.
- `tasks.md`: tick 1.1 and the Plan cell for checkpoint A, log line.
- Commit: `docs(1.1): accept ADRs 0054–0060, mark v0.8.0 in progress`.

## Task 2.1: shared `melete.ts`
- **Tests first** (`packages/shared/src/melete.test.ts`, red: module missing): valid/invalid cases for each enum; `MeleteSubject` (`new_per_day` 0..100, int counts); `MeleteNote`; `MeleteQuestion` (`due` nullable); `MeleteGrade` (max 6 right/missed, feedback 1..600, `suggested_rating` rejects `easy`); `MeleteQuestionsOutput` (1..10 questions, field length caps); `UpdateMeleteSubjectBody` refine (empty object rejected, either key accepted); `GradeAnswerResponse` union (graded / skipped / failed each parse, mixed shapes rejected); `RecordReviewBody` (answer ≤ 4000, optional `grade_run_id`, `suggested_rating`).
- **New** `packages/shared/src/melete.ts` exactly per TRD §2.1; add `export * from './melete.js'` to `index.ts` (alphabetical, after `linkSuggestions`).
- Commit: `feat(2.1): shared Melete contracts`.

## Task 2.2: shared `summarizer.ts` and `job.ts` additions
- **Tests first** (`summarizer.test.ts`, `job.test.ts`, red): `Settings` requires the six `melete_*` keys; `UpdateSettingsBody` accepts each new key alone, rejects empty, refine message names the new keys, `melete_learning_root` accepts a valid folder path or `null` (via `parseFolderPath` from `folders.ts`; check it's importable without a cycle), rejects `../x`; profile ids not accepted in the body (zod strips unknown keys, so assert they don't make an otherwise-empty body valid); `GetSettingsResponse.locked_instructions` requires `melete_questions` and `melete_grading` strings; `PromptProfile` requires `purpose`; `Job` requires `default_folder`.
- **Edit** `summarizer.ts`: `Settings`, `UpdateSettingsBody`, `GetSettingsResponse`, `PromptProfile` (+ `PromptPurpose` enum of the four values); `job.ts`: `default_folder: z.string()`. `melete_review_mode` uses `MeleteReviewMode` from `melete.ts`; model fields validated as non-empty strings in shared (`assertKnownModel` runs in the server service, as for `linking_model`).
- **Fallout:** fixtures and tests that build `Settings`, `PromptProfile`, `GetSettingsResponse` or `Job` in `packages/shared`, `apps/server` (jobs/settings/prompt services, `jobStore` row mapper must supply `default_folder` — set to `config.defaultNoteFolder` for now; real value in 6.2) and `apps/web` (typecheck/test fixtures). Server code that fails typecheck gets the minimum change (e.g. `purpose` from the profile row, `locked_instructions.melete_*` from constants in 2.3's prompts file — if that makes 2.2 not compile alone, 2.2 uses temporary empty-string placeholders replaced in 2.3; I'll prefer moving the two locked-instruction constants into 2.2 if it is clean).
- Commit: `feat(2.2): shared Melete settings, Job.default_folder, PromptProfile.purpose`.

## Task 2.3: migration 9 and default texts
- **Tests first** (`database.test.ts`, `melete/prompts.test.ts`, `summarizer/prompts.test.ts`; red):
  - From version 8 with data (two summary profiles, the linker profile, one review job): after `runMigrations` the user_version is 9; all five `melete_*` tables and indexes exist (`sqlite_master`); `prompt_profiles.last_folder` exists and is null for old rows; existing profiles, versions and the job are untouched; Study, Melete questions and Melete grading exist, each with version 1, `source 'seed'`, the right `purpose` and `seed_key`, guidance equal to the constants.
  - Name clash: a user profile named "Study" (different case too) exists at version 8 → migration succeeds, user profile keeps its name, seeded one is "Study (seeded)". Same for "Melete questions".
  - Seed-key guard: a profile with seed key `study` already present → no second Study row.
  - From empty (all migrations): Study, Melete questions and Melete grading exist once each; `default_profile_id` setting unchanged.
  - Partial partial uniqueness: `melete_notes_path` allows the same path twice when one has `missing_at` set, rejects two live ones.
  - Prompt tests: `buildMeleteSystemPrompt( locked, guidance )` wraps guidance under `## Guidance` (TRD §6.1); the locked constants start with the first-line markers the e2e fakes will use later (distinct first lines); defaults match TRD text.
- **New** `apps/server/src/melete/prompts.ts` (`LOCKED_INSTRUCTIONS_MELETE_QUESTIONS`, `LOCKED_INSTRUCTIONS_MELETE_GRADING`, both default guidance constants, `buildMeleteSystemPrompt`; `resolveMeletePrompt` is task 4.1, not here). **Edit** `summarizer/prompts.ts`: `STUDY_SEED_KEY`, `STUDY_GUIDANCE`, `SeedKey` gains `'study'`.
- **Edit** `repositories/database.ts`: `addMelete` function migration appended to `migrations` (SQL exactly per TRD §3.1; seeding via the same prepared-statement shape as `addLinking`); update `apps/server/CLAUDE.md` later in 2.4.
- Existing tests that count migrations / `user_version` are updated and named in the log.
- Commit: `feat(2.3): migration 9 addMelete and default prompt texts`.

## Task 2.4: repositories
- **Tests first** (one `*.repository.test.ts` per repository, in-memory DB via `test-support/database.setup.ts`; red: modules missing):
  - `meleteSubjects`: `upsertSubject` is idempotent on folder and returns the same id; `listSubjects`, `findSubject`, `updateSubject` (`auto_enroll`, `new_per_day`).
  - `meleteNotes`: insert/find/list by subject; `listNotesUnder( prefix )` includes missing notes and does not match a sibling prefix (`Learning/TS` vs `Learning/TSX`); `updateNote`; `findMissingByHash`; `setEnrolled` for many ids; `claimNextQueued` takes the oldest by `enrolled_at`, flips to `generating`, returns `undefined` when none, and two consecutive calls never return the same note; `requeueGenerating`.
  - `meleteQuestions`: `insertQuestions` assigns positions and `body_hash`; `listForNote`; `setState`; `retireActiveForNote` leaves dropped ones; `saveCard`/card round trip of every column; `listDue`, `listNew`, `listLearningSoon`, `countBySubject` all excluded for unenrolled, missing, dropped and retired (the join rule from TRD §3.2), and ordering rules `listDue` needs for 5.3 (learning/relearning first, then due).
  - `meleteReviews`: `insertReview`; `countNewReviewedSince` counts only `was_new = 1` since the cutoff, per subject.
  - `meleteRuns`: `insertRun` for generate and grade; `findRun`.
  - `promptProfiles`: `last_folder` on rows; `setLastFolder`; `ProfilePurpose` accepts the two new values; `listActiveProfiles( 'melete_questions' )`.
- **New** the five repository files (synchronous free functions on `getDatabase()`, Zod-parsed rows, style as `linkRuns.repository.ts`). **Edit** `promptProfiles.repository.ts` (purpose enum, `last_folder` in `ProfileRecord`, `setLastFolder`).
- **Edit** `apps/server/CLAUDE.md`: repositories line (the five Melete repositories, ADR 0058), the Melete boundary rule (ADR 0054: reads the vault, never writes), the ADR list.
- Commit: `feat(2.4): Melete repositories`.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `packages/shared` and `apps/server`; `apps/web` typecheck and `pnpm test` after 2.2 (fixtures). Never `--fix`.
- At the checkpoint end: an extra manual check that opens a copy of a 0.7.1-shaped database (built in the test) and runs all migrations; report commit hashes, results per folder, and the ADR-vs-TRD notes (none expected; the two items in Findings 2–3 are TRD extensions/clarifications to confirm).
- Not run: `pnpm e2e` (starts at checkpoint F), browser tests (no web screens touched).

## Open points to confirm on approval
1. Apply the " (seeded)" suffix rule to the two Melete profile names too (Finding 2).
2. `SeedKey` stays a server type (Finding 3).
