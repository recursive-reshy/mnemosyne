# Checkpoint E plan: Phase 6 (Study profile and folder memory)

## Context
ADR 0059: a seeded **Study** summary profile, and per-profile folder memory so a run of Study notes lands in the current subject's folder without re-picking. Migration 9, `STUDY_GUIDANCE`, `STUDY_SEED_KEY`, `SeedKey 'study'`, `prompt_profiles.last_folder`, `setLastFolder` and the shared `Job.default_folder` field already exist (checkpoints A–C). What's missing: Study in `SEEDED_PROFILES`, the server logic that computes and remembers the folder, and the web using `job.default_folder`. No new dependency, endpoint, status or migration. `pnpm e2e` is not required (starts at F). Order is fixed 6.1 → 6.2 → 6.3; after each task run test, lint, typecheck for the folders touched (server; web also `test:browser` is not needed, no layout change), tick Status, add a log line, commit `feat(6.x): …`, push.

## Findings (need your eye)
1. **Migration 1 loops `SEEDED_PROFILES`** ([database.ts:118](apps/server/src/repositories/database.ts#L118)). Adding Study to the array means a fresh database gets Study from migration 1, and migration 9's `seedProfile` then skips it (seed key exists), exactly as TRD §8 says. A 0.7.1 database already past migration 1 still gets it from migration 9. Side effects: Study is now created at migration 1 on fresh databases, so the "Study (seeded)" name-clash case stays covered only by the existing from-version-8 test. Existing tests that list every seeded profile change (TRD §13.1 allows it; each goes in the log line): `database.test.ts` ~506 (maps `SEEDED_PROFILES`) and ~1272 (`SEEDED_PROFILES.length + 2` count, which would otherwise be off by one), and the "is not in SEEDED_PROFILES yet" test in `summarizer/prompts.test.ts:143`, which flips to "is in SEEDED_PROFILES after business, coding, general".
2. **`defaultFolderFor` must be synchronous.** `toPublicJob` is sync and used by `listJobs`, `findJob`, `findNextRunnableJob` and others; TRD says "stat through `resolveFolder`", but `resolveFolder` is async *and creates the folder* (`mkdir`), which would make polling create directories. `resolveExistingFolder` is read-only but async. Plan: add a sync, read-only `existingFolderSync( vaultPath, folder )` beside `resolveExistingFolder` in `clients/vault.client.ts` (same rules: `parseFolderPath`, realpath inside the vault, is a directory; returns boolean) rather than making every job read async. This is a small deviation from the TRD wording, not a design change. Tell me if you'd rather go async.
3. **Linker uses the same default.** [linkJob.ts:38](apps/server/src/worker/linkJob.ts#L38) sends `job.target_folder ?? config.defaultNoteFolder` as the note's folder to the agent. Linking runs before review (`linking` status), so `default_folder` there would be the `config` value (computed only in `ready_for_review`). To keep linking consistent with where the note will actually land, use `defaultFolderFor( job )` there too. This is one line beyond the TRD; flagging it rather than silently leaving the linker looking at the wrong folder.
4. **Folder memory ignores non-summary writes?** `setLastFolder` runs for any job with a `prompt_profile_id`. Jobs with a null profile (older jobs) remember nothing. A profile deleted later: `setLastFolder` is already a no-op for an unknown id (repository test exists).
5. **Which folder is remembered** is the resolved `job.target_folder ?? defaultFolderFor( job )`, i.e. also when Naresh accepted the default, so the remembered folder stays current after a pick.

## Task 6.1: Study in `SEEDED_PROFILES`
- **Tests first** (red now):
  - `summarizer/prompts.test.ts`: `SEEDED_PROFILES` seed keys/names are `business, coding, general, study` / `Business ideas, Coding, General, Study`; Study's guidance is `STUDY_GUIDANCE`; replace the "not yet" test.
  - `services/prompts.service.test.ts`: `resetProfile` on Study restores `STUDY_GUIDANCE` after an edit (new version with source `reset`), `can_reset` true (exists), and it appears as a normal summary profile that can be chosen for a job.
  - `database.test.ts`: fresh database has Study once, seeded at version 1, `purpose 'summary'`; from-version-8 migration still seeds it and the "(seeded)" clash case still passes; update lines ~506 and ~1272 as in finding 1.
- **Code:** add `{ seedKey: STUDY_SEED_KEY, name: 'Study', guidance: STUDY_GUIDANCE }` to `SEEDED_PROFILES` in [summarizer/prompts.ts](apps/server/src/summarizer/prompts.ts) (after General; move the two constants above the array if needed). `resetGuidance` already reads `SEEDED_PROFILES`, so reset needs no change. Fix the existing tests the new entry breaks (finding 1).
- Red → green: new assertions fail on the array length, then pass.
- Commit `feat(6.1): Study seeded profile`.

## Task 6.2: `defaultFolderFor`, `Job.default_folder`, remember on save
- **Tests first:**
  - `clients/vault.client.test.ts`: `existingFolderSync` true for an existing folder and a nested one; false for missing, a file, `..` escape, a symlink pointing outside the vault, an invalid path; never creates anything.
  - `services/jobs.service.test.ts` (temp vault as already used there):
    - `default_folder` is `config.defaultNoteFolder` for a job in any status other than `ready_for_review`, and for a review job whose profile has no `last_folder`.
    - A review job whose profile has `last_folder` set to an existing folder returns it; if the folder was deleted/moved out of the vault, falls back to the config default; a null `prompt_profile_id` falls back.
    - Business job and Study job get their own defaults (memory is per profile).
    - `saveJob` with no `target_folder` writes to the profile's `last_folder`; with a `target_folder` it writes there and that folder becomes the profile's `last_folder`; a picked folder does not change another profile's memory.
    - A failed write (e.g. the existing "folder no longer valid" case, [jobs.service.test.ts:729](apps/server/src/services/jobs.service.test.ts#L729)) remembers nothing.
    - No profile id: save works, nothing remembered.
  - `worker/linkJob.test.ts`: the folder sent to the agent is the profile's remembered folder when no target is set (finding 3).
  - Existing tests that build a `Job` expectation with `default_folder: 'Mnemosyne'` ([jobs.service.test.ts:176](apps/server/src/services/jobs.service.test.ts#L176)) keep passing, since that job has no memory; listed in the log line if any change.
- **Code:**
  - `clients/vault.client.ts`: `existingFolderSync`.
  - `services/jobs.service.ts`: `defaultFolderFor( job )` (exported for the linker): for `ready_for_review` jobs with a `prompt_profile_id`, read `findProfileById( id )?.last_folder` and use it when `existingFolderSync( config.vaultPath, last_folder )`, else `config.defaultNoteFolder`. `toPublicJob` sets `default_folder: defaultFolderFor( job )`. `saveJob` resolves `const folder = job.target_folder ?? defaultFolderFor( job )`, calls `writeNote`, then `setLastFolder( job.prompt_profile_id, folder )` when the id is non-null, before/with the `moveTo( 'saved' )` (after the write succeeds, per ADR). Note `saveJob` runs when the job is `ready_for_review`, so `defaultFolderFor` there sees the review state.
  - `worker/linkJob.ts`: use `defaultFolderFor`. Because the job is `linking` at that point (not `ready_for_review`), `defaultFolderFor` must not depend on status for this caller: so give it the signature `defaultFolderFor( job, { always: boolean } )`? Simpler: split into `rememberedFolder( profileId )` (no status check) used by both `toPublicJob` (guarded by status) and the linker/save. Decide at implementation; tests above cover both.
  - `vault.service.ts` `listFolders` keeps returning the config default (the tree endpoint is not per job).
- Update `apps/server/CLAUDE.md` if its description of `DEFAULT_NOTE_FOLDER` ("validated at startup…") needs one line on folder memory.
- Commit `feat(6.2): folder memory per prompt profile`.

## Task 6.3: web `NoteDestination` and `FilenamePreview` on `job.default_folder`
- **Tests first** (`NoteDestination.test.tsx`, `ReviewScreen.test.tsx`, `ReviewScreen.links.test.tsx`; the job fixture already has `default_folder: 'Mnemosyne'`):
  - `NoteDestination` takes the job's default folder as a prop (`defaultFolder: string`); the picker's default option and the `FilenamePreview` show `job.default_folder` (e.g. `Learning/React`) when nothing is picked, and the pick when one is.
  - Renders the picker even when `useFolders` has no `default_folder` yet or errors (the tree still comes from `useFolders`); the error alert text stays.
  - Existing mocks of `useFolders` that return `defaultFolder` are updated; the hook may keep exposing it unused or drop it. Prefer dropping `defaultFolder` from `useFolders` only if nothing else reads it (check `FolderPicker` and the Melete folder picker later in G, which don't use it today); otherwise leave it.
- **Code:** [NoteDestination.tsx](apps/web/src/components/NoteDestination/NoteDestination.tsx) gets `defaultFolder` from its caller (`ReviewScreen`, passing `job.default_folder`); remove the `defaultFolder !== null` guard. Update test mocks (`ReviewScreen.browser.test.tsx` ~159 and the others that mock `useFolders`).
- Commit `feat(6.3): note destination on job default folder`.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server`; for 6.3 also `packages/shared` untouched, `apps/web`: `pnpm test`, `pnpm lint`, `pnpm typecheck`, plus `pnpm test:browser` for the ReviewScreen browser test since its mocks change. `pnpm build` in server after 6.2.
- Manual check at the end of the checkpoint (read-only reasoning, no real vault): the test that saves two Study jobs in a row proves the second one's `default_folder` is the first one's folder.
- Report: tasks with hashes, results per folder, ADR 0059 changes ADR 0022's "always reverts to the default" rule (already noted in the ADR), the sync-stat deviation (finding 2) and the linker change (finding 3).

## After approval
Save this plan to `docs/v0.8.0/plans/checkpoint-e.md`, tick the Plan cell for checkpoint E in `tasks.md`, commit `docs(plan): checkpoint E`, push, then start 6.1.
