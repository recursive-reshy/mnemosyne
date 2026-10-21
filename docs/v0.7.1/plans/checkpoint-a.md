# Checkpoint A plan: Phases 1–2 (kick-off and job lifecycle)

## Context
v0.7.1 starts with the job lifecycle (ADR 0048, TRD §2). Status rules are scattered: hand-written checks in each `jobs.service.ts` function, `expires_at` set at about ten call sites, four status lists hard-coded in `jobStore.repository.ts`, and two recovery updates that bypass `moveTo()`. This checkpoint pins today's behaviour with a characterization test, then moves the rules into one pure table that `moveTo` and the repository use. No job behaviour changes (PRD §4).

Checkpoint order is fixed: 1.1 → 2.1 → 2.2 → 2.3 → 2.4. After each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server` (and in `packages/shared` if touched), then tick Status, add a log line, commit, push.

## Findings from reading the 0.7.0 code (to settle in 2.1; any difference from the TRD table is a stop-and-ask)
Reading `services/jobs.service.ts` shows three places where the code differs from the TRD §2.2 table:
1. **`failJob`** refuses `failed`, `ready_for_review`, `summary_failed` and `saved`. The TRD says "every non-terminal state → failed", which would include the two review states. Today's `FAILABLE` set is: `queued`, `downloading`, `converting`, `transcribing`, `fetching`, `summarizing`, `linking`.
2. **`updateDraft`** (and so `acceptSuggestions`, `rejectSuggestions`, and the same-state `moveTo`) only works in `ready_for_review`. The TRD marks `summary_failed` as `editable`; today it is not.
3. **`saveJob`** only works from `ready_for_review`, so `summary_failed → saved` does not exist (the TRD leaves this to the test).

Two further facts to pin:
- `markStatus` allows `queued → downloading → converting → transcribing` for video and `queued → fetching` for article only.
- `completeSummary` with linking on moves to `linking` and clears `expires_at`; `discardJob` and `findSource` work in `ready_for_review` and `summary_failed` only.

The table in 2.2 follows the test, not the TRD. If the test confirms 1–3, I stop and ask before 2.2 (CLAUDE.md: a doc that looks wrong → ask). My suggested answer is "the table reproduces 0.7.0": `failJob` stays limited to the seven states, and `editable` is `ready_for_review` only. That means the TRD §2.2 table and the ADR's "every non-terminal state can move to failed" note need correcting by Naresh.

## Task 1.1: kick-off docs (no code, no tests)
- `docs/decisions/0048`–`0053`: Status line `Proposed` → `Accepted`.
- `docs/README.md`: index rows for 0048–0053 to `Accepted`; "current version" line 0.6.0 → 0.7.1; v0.7.1 entry "(planned)" → "(in progress)".
- Root `CLAUDE.md` already says 0.7.1; no change.
- `tasks.md`: tick 1.1, log line.
- Commit: `docs(1.1): accept ADRs 0048–0053, mark v0.7.1 in progress`.

## Task 2.1: characterization test (against unchanged 0.7.0 code)
- **New:** `apps/server/src/jobs/lifecycle.characterization.test.ts`. Uses `test-support/database.setup.ts` (in-memory DB) and the setup style of `services/jobs.service.test.ts`, with `insertJob` to place a job in a given status and source.
- It iterates over every status (11) × source type (video, article) and calls each service function: `markStatus` (each step status), `completeAcquisition`, `completeSummary` (linking off and on), `completeLinking`, `failLinking`, `failSummary`, `retrySummary`, `regenerateSummary`, `runLinking`, `submitPastedText`, `failJob`, `updateDraft`, `acceptSuggestions`, `rejectSuggestions`, `saveJob`, `discardJob`, `findSource`. For each it records the outcome as `ok → <new status>` or `409`, plus `expires_at` afterwards (null / set / unchanged).
- It also pins the link-state transitions made by these functions (`off`/`pending`/`linked`/`failed`, `null` after regenerate) and the startup recovery (`recoverInterruptedJobs`).
- Expectations are written as one explicit table in the test file, so the file reads as the specification.
- **Red step:** first write one deliberately wrong expectation (e.g. `summary_failed → saved` expected to succeed), run it, show it failing for that reason, then correct it. The rest is green on 0.7.0 code, since it pins existing behaviour.
- Does not touch production code. If any move looks like a bug, stop and ask.
- Commit: `test(2.1): job lifecycle characterization`.

## Task 2.2: `jobs/lifecycle.ts` (pure)
- **Tests first:** `apps/server/src/jobs/lifecycle.test.ts`, red because the module doesn't exist. Covers: every pair in `MOVES` allowed per source; every other (from, to, source) refused; `canMove`; `assertMove` throws the existing `ConflictError` with message `Cannot move job from X to Y`; `statusesWhere` matches the table for each property; link states and `assertLinkMove`.
- **New:** `apps/server/src/jobs/lifecycle.ts`. Exports `STATES`, `MOVES`, `canMove`, `assertMove`, `statusesWhere`, `LINK_STATES`, `LINK_MOVES`, `assertLinkMove`, exactly as in TRD §2.2. Imports only `JobStatus` / `SourceType` from `@mnemosyne/shared` and `ConflictError` from `errors.js`. No import from services or repositories.
- The table matches the 2.1 findings (see the three points above).
- Nothing else changes; 2.1 stays green.
- Commit: `feat(2.2): job lifecycle table`.

## Task 2.3: `moveTo` enforces the table
- **Tests first (red):** extend `lifecycle.test.ts` / `jobs.service.test.ts` for the new behaviour: `moveTo` refusing an unlisted move, a same-state move refused outside editable states, `expires_at` set on entering an expiring state and cleared on leaving, unchanged on an editable same-state move unless the caller passes the autosave reset.
- **Edit** `services/jobs.service.ts`:
  - `moveTo` calls `assertMove( job, to )`, then derives `expires_at` from `STATES[ to ].expires` (`expiryFromNow()` when entering, `null` when leaving a non-expiring target, unchanged on same-state unless `changes.expires_at` is given).
  - Replace the hand-written checks in `completeAcquisition`, `completeSummary`, `completeLinking`, `failLinking`, `failSummary`, `retrySummary`, `regenerateSummary`, `runLinking`, `submitPastedText`, `failJob`, `updateDraft`, `acceptSuggestions`, `rejectSuggestions` and `saveJob` with `assertMove`. Messages stay identical; the pasted-text message (`Pasted text can only continue a failed article job`) is kept where it exists today.
  - Delete `nextStep`; `markStatus` uses `canMove`. Remove `finalStatuses` once `failJob` goes through the table. `downloadableStatuses` stays unless the table replaces it cleanly.
  - Callers stop passing `expires_at` except `updateDraft`'s autosave reset.
  - `config.agent === null` check in `runLinking` stays.
- Any test that relied on writing statuses the lifecycle now refuses is changed minimally and named in the tasks.md log line (TRD §10.1).
- The 2.1 characterization test must pass unchanged.
- Update `apps/server/CLAUDE.md` folder structure with `jobs/` and the "lifecycle" rule in the same commit.
- Commit: `refactor(2.3): moveTo enforces the lifecycle`.

## Task 2.4: repository lists from the table
- **Tests first (red):** `jobStore.repository.test.ts` cases for the lists driven by the table (runnable, active, expired, recovery), including a status added to a test copy of the table, if that is practical; otherwise assert the generated list equals today's literal list.
- **Edit** `repositories/jobStore.repository.ts`: `findNextRunnableJob`, `listActiveJobs`, `findExpiredJobs`, `markInterruptedJobs` and `markInterruptedLinkingJobs` build `IN ( ?, ?, … )` from `statusesWhere( … )` as bound parameters (no string concatenation of values). Recovery uses the states whose `onRestart` is `failed` / `ready_for_review`. `listActiveJobs` becomes `active`, `findExpiredJobs` becomes `expires`. Behaviour and SQL results stay the same.
- **Edit** ADR 0048: final table and both Mermaid diagrams (job, link state), taken from the 2.1 findings. If they differ from the TRD, say so in the checkpoint report ("ADR 0048 changes TRD §2.2").
- Commit: `refactor(2.4): repository status lists from the lifecycle`.

## Verification
- After each task: `pnpm test`, `pnpm lint` (no `--fix`), `pnpm typecheck` in `apps/server`.
- End of checkpoint: `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm build` in `apps/server`; shared and web untouched, but run their tests once to confirm. Report per task with commit hashes, results per folder, and the ADR/TRD differences.
- Tick the Plan cell for Checkpoint A (and save this plan to `docs/v0.7.1/plans/checkpoint-a.md`) on approval, commit `docs(plan): checkpoint A`, push, then start 1.1.
