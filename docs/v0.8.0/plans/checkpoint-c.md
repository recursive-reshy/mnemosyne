# Checkpoint C plan: Phase 4 (question generation)

## Context
Checkpoints A–B built the Melete data, scan and enrollment; enrolling sets `generation = 'queued'` but nothing consumes the queue. Checkpoint C adds the consumer: a Claude call that turns one note into questions (ADR 0055), post-processing, a service that records the run and stores the questions (ADR 0058), and the generator loop started with the server. No scheduling or review yet (D). No UI, no shared contract change (`MeleteQuestionsOutput` already exists in `packages/shared/src/melete.ts`), no new dependency, no `pnpm e2e` (starts at F).

Order is fixed: 4.1 → 4.2 → 4.3 → 4.4. After each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server`, tick Status, add a log line, commit `feat(4.x): …`, push. Shared and web are untouched (confirmed with `git status`).

## Findings (items that need your eye)
1. **`resolveMeletePrompt` returns the profile's current version.** TRD §6.1 / §9.1 call it `resolveMeletePrompt( purpose )`. It goes in `prompts.service.ts` beside `resolveLinkerPrompt`, using `findProfileBySeedKey( MELETE_QUESTIONS_SEED_KEY | MELETE_GRADING_SEED_KEY )` and throwing if missing. The task list puts it in `melete/prompts.ts`, but that file is pure constants and importing a service there would invert the dependency, so it lives in the service. Task 4.1 wording changes only in location.
2. **`LogContext` has no `melete_note_id`.** TRD §7.5 requires it, so `logContext.ts` gains the optional key (a type-only addition, tested through `withLogContext`).
3. **`MeleteError`** goes in `errors.ts` per TRD §6.3, but the Claude client needs `usage` on it (as `SummaryError` has). It is `class MeleteError extends Error { usage?: TokenUsage }`. `TokenUsage` is exported from `claude.client.ts`, so `errors.ts` would import from a client; to avoid that, `errors.ts` declares its own `{ input_tokens, output_tokens }` shape inline.
4. **Hash mismatch / vanished file in `generateForNote`** (TRD says "update the note via the scan rules and stop"): implemented by calling `scanLearningRoot( { force: true } )`, which already applies the edit rules (retire, queue again if enrolled) or marks the note missing. Afterwards, if the note is still `generating` (it was marked missing, or the scan doesn't touch it), the service sets it to `idle`. That avoids a second implementation of the scan rules.
5. **Note unenrolled, or already holding active questions for this hash, while queued** (cases the TRD leaves open): `generateForNote` sets `idle` and makes no call. Regenerate retires the old ones first, so "active for this hash" only happens from a race.
6. **Generation requires the Anthropic key**: `config` already exits without one, so no extra check.
7. **Cost of a failed call**: `estimateCostUsd` when usage is known, else `null` tokens and cost, as TRD §6.5.

## Task 4.1: prompts and Claude client
- **Tests first** (red on missing exports):
  - `melete/prompts.test.ts`: `buildMeleteSystemPrompt` already tested in 2.3; add nothing there. New `services/prompts.service.test.ts` cases: `resolveMeletePrompt( 'melete_questions' )` and `( 'melete_grading' )` return the seeded profile and its current version; after `saveVersion` they return the new guidance; missing profile throws.
  - `clients/claude.client.test.ts` additions, same mocked-SDK harness as `summarizeSource`: `generateQuestions` — one `Anthropic` client per call with `maxRetries: 1` and `timeout` from `config.melete.generationTimeoutMs`; `messages.parse` called with `max_tokens 4096`, `system`, one user message, `output_config { effort 'medium', format }`; returns `{ output, usage }` from `parsed_output` validated by `MeleteQuestionsOutput`; `stop_reason max_tokens` → `MeleteError` ("cut off") with usage; `refusal` → `MeleteError` with usage; unparseable output → `MeleteError` with usage; `Anthropic.APIError` → `MeleteError` "Question generation failed: …" with `cause`. A non-API error is rethrown. (`gradeAnswer` is 5.4, not here; its `MeleteError` wording is shared.)
  - `claude.integration.test.ts`: a second `describe.skipIf( !hasApiKey )` generating questions from a short fixture note, asserting 1–10 questions, non-empty prompt and answer.
- **Edit**: `clients/claude.client.ts` (`generateQuestions( { model, system, user } )`, `QuestionsOutcome`), `errors.ts` (`MeleteError`), `services/prompts.service.ts` (`resolveMeletePrompt`), `logContext.ts`.
- Commit: `feat(4.1): Melete question generation call`.

## Task 4.2: post-processing (`melete/questions.ts`, new)
- **Tests first** (`melete/questions.test.ts`, pure, red on missing module): fields trimmed; empty prompt or empty answer dropped; more than 10 → first 10 kept; passage that is a verbatim substring of the body kept; passage that matches only after whitespace normalisation (extra spaces, newlines, CRLF) kept **as written by the model, trimmed**; passage not in the body → `''`; empty passage stays `''`; positions are not set here (repository numbers 1..n; test that the output order is preserved); all dropped → empty array.
- **New** `melete/questions.ts`: `processQuestions( output, body ): GeneratedQuestion[]` (the type from `meleteQuestions.repository.ts`).
- Commit: `feat(4.2): Melete question post-processing`.

## Task 4.3: `generateForNote`
- **Tests first** (`services/meleteGeneration.service.test.ts`; real temp vault from `test-support/meleteVault.fixture.ts`, in-memory DB, `clients/claude.client.js` mocked, notes created through a forced scan; red on missing module):
  - Happy path: enrolled `generating` note → run row `generate` with model = question model, `prompt_version_id` = current Melete questions version, tokens, `cost_usd`, `succeeded`; questions inserted with `run_id`, `body_hash` = the hash just read; `generation 'idle'`, error cleared; the user message is `Subject: <name>\nTitle: <title>\n\n<body>` with front-matter removed; system prompt = `buildMeleteSystemPrompt( locked, guidance )`.
  - Length guard: body over 60 000 chars → no Claude call, failed run row (null tokens/cost), note `failed` with "Note is too long for question generation (N characters, limit 60000). Split it into smaller notes."
  - Passage check applied (a bad passage stored as `''`).
  - Claude failure (`MeleteError` with usage, and without): failed run row with tokens/cost when known, note `failed` with the message, no questions inserted, other queued notes untouched.
  - Zero usable questions after processing → failed ("No usable questions came back"), run recorded as `failed`.
  - File edited since queued (hash differs): no Claude call, scan rules applied (old questions retired, note queued again).
  - File gone: no call, note marked missing and `idle`.
  - Note not enrolled any more / already has active questions for this hash: `idle`, no call.
  - Insert and `idle` in one transaction (a thrown insert leaves the note not `idle`); unknown note id is a no-op that logs.
  - No note text in logs (spy on `logger`).
- **New** `services/meleteGeneration.service.ts`: `generateForNote( noteId, now? )`. Reads with `readFile` under `config.vaultPath` and `splitFrontMatter` / `bodyHash` / `noteTitle` from `melete/scan.ts`; model from `resolveMeleteQuestionModel()`; run row via `insertRun`; `estimateCostUsd`; questions via `insertQuestions`; note update via `updateNote`. Never throws for per-note failures (they become `failed`); only unexpected DB errors propagate to the loop's catch.
- Commit: `feat(4.3): Melete generation service`.

## Task 4.4: generator loop
- **Tests first** (`worker/meleteGenerator.test.ts`, modelled on `worker.test.ts`, `generateForNote` mocked, fake timers; red on missing module): processes queued notes oldest `enrolled_at` first, one at a time (a gate proves no overlap); runs again when more are queued while busy; ignores `idle`/`failed`/`generating`-and-unenrolled; a thrown error is logged and the loop continues; `requeueGenerating()` is called once on start (a `generating` note becomes `queued`); the returned stop function stops the interval and awaits the running pass; no new pass after stop; log context carries `melete_note_id` (read with `getLogContext` inside the mock).
- `shutdown.test.ts`: `stopMeleteGenerator` is called on shutdown with the others, and the store closes only after it resolves; `server.test.ts` if it lists the started loops.
- **New** `worker/meleteGenerator.ts` (`startMeleteGenerator()` same shape as `startWorker`; `claimNextQueued()` → `withLogContext( { melete_note_id }, () => generateForNote( id ) )`). **Edit** `server.ts` (start after `recoverInterruptedJobs`) and `shutdown.ts` (`stopMeleteGenerator` in options and in the `Promise.all`). **Edit** `apps/server/CLAUDE.md`: `melete/questions.ts`, the generation service and the generator loop in the folder structure and worker lines.
- Commit: `feat(4.4): Melete generator loop`.

## Reused code
`summarizeSource` structure (`claude.client.ts`), `SummaryError` pattern, `estimateCostUsd` (`summarizer/pricing.ts`), `resolveMeleteQuestionModel` (3.5), `buildMeleteSystemPrompt` and the locked constants (`melete/prompts.ts`), `findProfileBySeedKey` and `resolveLinkerPrompt` shape, the meleteNotes/Questions/Runs repositories (`claimNextQueued`, `requeueGenerating`, `insertQuestions`, `insertRun`), `splitFrontMatter` / `bodyHash` / `noteTitle`, `scanLearningRoot`, `startWorker` / `createShutdown`, `meleteVault.fixture.ts`, `meleteData.fixture.ts`.

## Verification
- Per task in `apps/server`: `pnpm test`, `pnpm lint`, `pnpm typecheck`; `pnpm build` after 4.4. The integration test is skipped without `ANTHROPIC_API_KEY` (not run here; reported as skipped).
- No test touches the network, Claude or a real vault; a test asserts the temp vault tree is unchanged by generation.
- Checkpoint report: commits per task, results per folder (shared and web untouched), the two small TRD placements above (`resolveMeletePrompt` in `prompts.service.ts`, `LogContext` key), nothing deferred. No ADR expected.
