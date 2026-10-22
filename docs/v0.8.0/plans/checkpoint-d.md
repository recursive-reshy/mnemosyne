# Checkpoint D plan: Phase 5 (scheduling and review)

## Context
Checkpoints A–C store questions and generate them; nothing schedules or serves them. Checkpoint D adds FSRS scheduling (ADR 0056), the day boundary, the review queue, Claude grading (ADR 0055), recording a review, and the last three routes (TRD §5, §6.3, §7.1–7.4, §10). Server only: no new shared contract (`GradeAnswerBody`, `GradeAnswerResponse`, `RecordReviewBody`, `RecordReviewResponse`, `GetNextReviewResponse` exist in `packages/shared/src/melete.ts`), no web, no migration (the `melete_*` tables and the repository functions `listDue` / `listNew` / `listLearningSoon` / `countBySubject` / `saveCard` / `insertReview` / `countNewReviewedSince` / `insertRun` / `findRun` exist). One new dependency: `ts-fsrs` in `apps/server`, named in TRD §1 and ADR 0056. No `pnpm e2e` (starts at F).

Order is fixed: 5.1 → 5.2 → 5.3 → 5.4 → 5.5. After each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server` (`pnpm build` after 5.5), tick Status, add a log line, commit `feat(5.x): …`, push.

## Findings (need your eye)
1. **`ts-fsrs` 5.4.2 API checked (unpacked from the registry, read-only).** `Card` is `{ due: Date, stability, difficulty, elapsed_days (deprecated), scheduled_days, learning_steps, reps, lapses, state: State, last_review?: Date }`; `State` is a numeric enum (New 0, Learning 1, Review 2, Relearning 3). `GeneratorParameters` has `request_retention`, `enable_fuzz`, `enable_short_term`, `learning_steps`, `relearning_steps`. This matches TRD §5.1; no design change. `elapsed_days` as 0: the library's `init` recomputes it from `last_review` on every `next` call, so restoring 0 is harmless. 5.1 proves it with a test (same result with `elapsed_days` 0 and with the true value) and records that in the log line.
2. **`before_state` JSON for `melete_reviews`**: the card as `toRow` writes it (the `CardRow` columns, `fsrs_state` as the app's string), so the future optimizer reads app data, not library enums. Stored by `recordReview`.
3. **`due` for a served new question** (TRD §5.2/§7.1 step 3): `getNextReview` saves `due = now` and leaves `fsrs_state 'new'`, via `saveCard` with the other fields unchanged. `listDue` already returns such a question on reload (2.4 choice), so a reload resumes it; it is not counted twice against the day's allowance because only `was_new` reviews count (`countNewReviewedSince`).
4. **`new_remaining` and `learning_soon` totals replace the 3.4 placeholders.** `toMeleteSubject.new_remaining_today` becomes `min( max( new_per_day − countNewReviewedSince( subject, dayStart( now ) ), 0 ), new_available )`, and `getToday` totals gain a real `learning_soon`. Two existing `melete.service.test.ts` expectations on `new_remaining_today` stay true when nothing was reviewed; I will list any that change in the log line (TRD §13.1 allows contract-driven changes only, so I will stop and ask if one needs more than this).
5. **`GradeAnswerResponse.run_id` for `failed`**: `number | null`. A `MeleteError` with a run row (the call happened) gives its id; a failure before any call gives `null`. Grading `MeleteError` wording mirrors generation: "Grading failed: …", "Grading was cut off…", "Grading was declined…", "Grading response did not match the expected format".
6. **Grading timeout/retries** (TRD §6.3): `maxRetries: 0`, `timeout: config.melete.gradingTimeoutMs` (already in config), `max_tokens` 1024, `effort: 'low'`.
7. **Review mode setting**: `recordReview` calls `setSetting( 'melete_review_mode', body.mode )` only when it differs from the stored one, inside the same transaction as the review (the settings repository function used by `settings.service`).
8. **Blank rule** is a pure function `isBlankAnswer` in `melete/grading.ts` (new tiny file) so the regex has direct tests; the service uses it.
9. **`obsidian_url`**: pure helper `obsidianUrl( vaultName, path )` in `melete/obsidian.ts`: `obsidian://open?vault=<encodeURIComponent name>&file=<encodeURIComponent path minus .md>`; null when `config.obsidianVaultName` is unset. Unit-tested (spaces, `#`, nested folders, non-ASCII).

## Task 5.1: scheduler (`melete/scheduler.ts`, new)
- **Dependency**: `pnpm --filter @mnemosyne/server add ts-fsrs@^5.4.2` (lockfile change in this commit).
- **Tests first** (`melete/scheduler.test.ts`, red on missing module), with an injectable no-fuzz scheduler and a fixed clock:
  - `newCard( now )` → `fsrs_state 'new'`, reps 0, `due` = now; `toRow` of a new card has `last_review` null.
  - Rating map: again/hard/good/easy → the library's Rating; `nextCard` from new: Again/Hard/Good → `learning` with the default steps (due +1 m / +5 m… as the library returns; assert against the library's own output for the same input rather than hard-coding minutes), Easy → `review` with `scheduled_days` ≥ 1.
  - Review card + Good → longer `scheduled_days` than before; review card + Again → `relearning`, `lapses` +1.
  - `toRow`/`fromRow` round trip is lossless for every field (dates as ISO strings, state names ↔ enum); `fromRow` of a row with `last_review` null gives `last_review` undefined.
  - `elapsed_days` 0 vs true value gives the same next card (finding 1).
  - The app's default scheduler has fuzz on and uses `config.melete.requestRetention` (read from `scheduler.parameters`).
- **New** `melete/scheduler.ts`: `newCard`, `nextCard( card, rating, now, scheduler = appScheduler )`, `toRow`, `fromRow`, `toFsrsRating`, `createScheduler( { fuzz } )`. Pure; imports `CardRow` type from the questions repository.
- Commit `feat(5.1): FSRS scheduler`.

## Task 5.2: day start (`melete/day.ts`, new)
- **Tests first** (`melete/day.test.ts`): Singapore (no DST) with start hour 4: 03:59 → yesterday 04:00, 04:00 → today 04:00, 23:30 → today 04:00; hour 0 → local midnight; a UTC instant just before and after the boundary; a DST zone (`America/New_York` across the spring-forward day 2027-03-14 and fall-back day 2026-11-01, including a start hour inside the skipped hour, e.g. 2) returns the most recent real instant at or before `now`, never in the future, never more than 24 h + 1 h before `now`. Timezone and hour are parameters (default from config) so tests don't touch the environment.
- **New** `melete/day.ts`: `dayStart( now, { timeZone, startHour } = config )` using `Intl.DateTimeFormat` parts (as `backupName`): take the zone's local date, build the candidate instant for `startHour:00` by finding the UTC offset at that local time (iterating once to settle DST), and step back a day if the candidate is after `now`.
- Commit `feat(5.2): Melete day start`.

## Task 5.3: review queue (`services/meleteReview.service.ts`, new) and Today counts
- **Tests first** (`services/meleteReview.service.test.ts`; temp vault + in-memory DB + `meleteData.fixture.ts`, fixed clock; red on missing module). Covers TRD §13.1 queue list:
  - Due before new; learning/relearning before review among due; ordering by `due` then path then position.
  - New: ordered by note `enrolled_at`, path, position; first served gets `due = now` saved and `fsrs_state` still `new`; asking again returns the same question (resume); `counts.new_remaining` = Σ `min( remaining, available )`.
  - New-per-day: `new_per_day` 2 → after two `was_new` reviews since `dayStart`, no more new; reviews just before 04:00 Singapore time don't count after 04:00 (and with `MELETE_DAY_START_HOUR` 0 the boundary is midnight); `new_per_day` 0 serves no new.
  - Excluded: unenrolled notes, missing notes, dropped and retired questions.
  - Learning-soon fallback: nothing due, a `learning` card due in 10 min → returned; due in 25 min → `item: null`; counts `learning_soon` reflects it.
  - Per-subject scope: `subjectId` limits due, new and counts; an unknown subject → 404; a subject outside the learning root → 404.
  - `item: null` when nothing; `obsidian_url` set from `config.obsidianVaultName` or null; `note` has title, path and subject name; response parses with `GetNextReviewResponse`.
  - No learning root → 409 "Choose a learning root first". The scan runs (30-second rule) before the queue is built; `scanLearningRoot` is the real one on the temp vault.
  - `getToday`: totals and per-subject `new_remaining_today` follow the allowance and `learning_soon` is real (updates in `melete.service.test.ts`, see finding 4).
- **New** `getNextReview( { subjectId?, now } )`, `getReviewCounts( { subjectIds, now } )` in the service; **edit** `melete.service.ts` (`toMeleteSubject`, `getToday`) to use the same counting helper so Today and the review screen can't disagree. New `melete/obsidian.ts` (+ test).
- Commit `feat(5.3): Melete review queue`.

## Task 5.4: grading and recording
- **Tests first**
  - `clients/claude.client.test.ts` for `gradeAnswer( { model, system, user } )`, same mocked-SDK harness as `generateQuestions`: client built with `maxRetries: 0` and the grading timeout; `messages.parse` with `max_tokens 1024`, `effort 'low'`, `MeleteGradeOutput` format; returns `{ output, usage }`; `max_tokens`, `refusal`, unparseable → `MeleteError` with usage; `APIError` → `MeleteError` with `cause`. Integration test skipped without a key, beside the others.
  - `melete/grading.test.ts`: `isBlankAnswer` — empty, whitespace, "idk", "I don't know", "dont know", "no idea", "pass", "???", "I don't know." → true; "I don't know the exact value but it is X" → false; "pass by reference" → false.
  - `melete/prompts.test.ts`: `buildMeleteGradingUser( question, answer, passage, learnerAnswer )` — headings `Question`, `Reference answer`, `Passage` (omitted when empty), `Learner's answer` (TRD §6.2).
  - `services/meleteReview.service.test.ts` (same file as 5.3) for `gradeAnswer( questionId, body )`: 404 unknown; 409 dropped / retired / unenrolled / missing note; blank → `skipped` and no Claude call and no run row; graded → run row `grade` with `question_id`, grading model, current grading prompt version id, tokens, cost, `succeeded`, response `{ outcome 'graded', grade, run_id }`; `MeleteError` → `failed` with the message, a failed run row (tokens when known), HTTP-200-shaped value (never throws); unexpected non-Melete error → `failed` too, `run_id` null; no answer text in logs.
  - `recordReview( questionId, body, now )`: 404/409 as above; `grade_run_id` must be a grading run for this question (400 otherwise, no card change); in one transaction the card advances (state, due, reps, lapses via `nextCard`), a `melete_reviews` row stores mode, rating, `suggested_rating`, answer, `grade_run_id`, `was_new` (true only when `fsrs_state` was `new` before) and `before_state`; a thrown insert rolls the card back; returns the question and fresh counts; `melete_review_mode` setting changes only when `mode` differs; Again on a new card brings it back via learning-soon within the session; a served-then-rated new question counts against the day's allowance. Uses the no-fuzz scheduler through an injectable parameter so intervals are exact.
- **Edit** `clients/claude.client.ts` (`gradeAnswer`, `GradeOutcome`), `melete/prompts.ts` (`buildMeleteGradingUser`), `services/meleteReview.service.ts` (`gradeAnswer`, `recordReview`), `repositories/meleteRuns.repository.ts` only if `kind 'grade'` needs a lookup helper (`findRun` exists). New `melete/grading.ts`.
- Commit `feat(5.4): Melete grading and review recording`.

## Task 5.5: routes
- **Tests first** (`routes/melete.routes.test.ts` additions through `app.ts`, temp vault, Claude client mocked; red: routes 404): `GET /api/melete/review/next` (200 with item and counts, `?subject=` scope, bad uuid 400, no learning root 409, response parses with the shared schema, `obsidian_url` present when the vault name is set); `POST …/questions/:id/grade` (graded / skipped / failed all 200, body validated with `GradeAnswerBody`: answer over 4000 chars → 400, bad uuid 400, 404, 409); `POST …/questions/:id/review` (200 with question and counts, invalid rating 400, bad `grade_run_id` 400, 404, 409). Review of a vault leaves the temp vault tree unchanged.
- **Edit** `routes/melete.routes.ts`, `controllers/melete.controller.ts` (`getNextReview`, `postGradeAnswer`, `postRecordReview`; four layers as the first nine routes). **Edit** `apps/server/CLAUDE.md`: `scheduler.ts`, `day.ts`, `grading.ts`, `obsidian.ts`, the review service, the `ts-fsrs` dependency, the three routes.
- Commit `feat(5.5): Melete review routes`.

## Reused code
`summarizeSource`/`generateQuestions` shape and `MeleteError` (`clients/claude.client.ts`, `errors.ts`); `estimateCostUsd` (`summarizer/pricing.ts`); `resolveMeleteGradingModel` (`settings.service.ts`); `resolveMeletePrompt( 'melete_grading' )` (`prompts.service.ts`); `buildMeleteSystemPrompt` and locked constants (`melete/prompts.ts`); the repositories listed above; `scanLearningRoot`; `getLearningRoot`; `requireSubjectInRoot` / `toMeleteQuestion` in `melete.service.ts` (export or move the two small helpers rather than copy); `backupName`'s `Intl` parts approach; `meleteVault.fixture.ts`, `meleteData.fixture.ts`; the controller/route/validation pattern from checkpoint B.

## Verification
Per task in `apps/server`: `pnpm test`, `pnpm lint`, `pnpm typecheck`; `pnpm build` after 5.5. Shared and web are untouched (`git status`). Tests use fixed clocks, the no-fuzz scheduler, a temp vault and a mocked Claude client; the real-API integration tests are skipped without a key and reported as skipped. Checkpoint report: commits per task, results per folder, the `elapsed_days` finding, the placeholders replaced (finding 4), any existing test changed, and no ADR expected.
