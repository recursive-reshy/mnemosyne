# Checkpoint B plan: Phase 3 (summarizer)

## Context
After Checkpoint A the job model and SQLite store are ready. Checkpoint B makes the worker summarize each transcript with one Claude call, clean and render the result, and move jobs through `summarizing → ready_for_review | summary_failed`. It also removes `done`. ADRs: 0007, 0014, 0015 (0015 overrides TRD §3 only where noted below). Test-first per task, one commit each, pushed. After each task run `pnpm test`, `lint`, `typecheck` in every touched folder (`apps/server`; `packages/shared` for 3.8; `apps/web` for 3.8).

## Findings that shape the plan
- **SDK API (via the claude-api skill; Context7's quota is exhausted).** Use `client.messages.parse( { model, max_tokens, system, messages, output_config: { format: zodOutputFormat( Schema ) } } )` from `@anthropic-ai/sdk` and `@anthropic-ai/sdk/helpers/zod`. The result has `parsed_output` (null on parse failure) and `stop_reason`. Client options: `new Anthropic( { apiKey, timeout /* ms */, maxRetries } )`. Typed errors are `Anthropic.APIError` and subclasses.
- **Sonnet 5.5 specifics.** `claude-sonnet-5-5` always thinks (`thinking: disabled` and forced `tool_choice` both 400), and thinking tokens count against `max_tokens`. Structured output via `output_config.format` is the supported route, so no forced tool call is needed.
- **Zod 4 compatibility** of `zodOutputFormat` is unverified. Task 3.2 starts by installing and checking it. Fallback if it fails: `output_config.format = { type: 'json_schema', schema: z.toJSONSchema( SummaryResult ) }` and a manual `SummaryResult.parse` of the text block. No further decision needed.

## Points to confirm (deviations from the TRD text)
1. **`max_tokens`.** TRD §5.2 says "around 4000", but thinking tokens share that budget, so a long talk could truncate the JSON. Plan: `max_tokens: 16000` (non-streaming is fine at that size) and `output_config.effort: 'medium'`; `stop_reason` of `max_tokens` or `refusal` throws, which becomes `summary_failed`.
2. **Empty sections.** `formatSummary` omits `## Key points` or `## Notable quotes` when the cleaned list is empty (TRD §5.4 shows all three). Say if you'd rather keep empty headings.
3. **No server-side refusal fallbacks.** The skill suggests `fallbacks` for Sonnet 5.5 by default, but that needs the beta endpoint and goes beyond ADR 0014. A refusal becomes `summary_failed` with a Retry button. Say if you want it.
4. **Intermediate states on `main`.** Between 3.6 and 3.8, downloads and the web "done" UI don't appear, because no job reaches `done` any more. Between 3.6 and 3.7, a `summarizing` job found by the worker would hit `markStatus` and throw (it only happens after a restart mid-summary, so only in the commit window). Both close in 3.7 and 3.8 (the web download gating and polling stop-condition are in 3.8).
5. **`ANTHROPIC_API_KEY` is required** (TRD §10). Existing tests that import `config.js` would exit, so the Vitest configs set `test.env.ANTHROPIC_API_KEY = 'test-key'`. Dev needs the key in `.env`; the server refuses to start without it.

## Tasks

### 3.1 Config and `settings.ts`
- Files: `config.ts`, `config.test.ts`, `vitest.config.ts`, `.env.example`, `src/settings.ts` + `settings.test.ts`, `apps/server/CLAUDE.md` (Environment list).
- Tests first: `loadConfig` returns `anthropicApiKey`, `summaryTimeoutMs` (default 300000), `reviewTtlHours` (default 24); a missing or empty `ANTHROPIC_API_KEY` throws naming it; non-numeric or non-positive `SUMMARY_TIMEOUT_MS` / `REVIEW_TTL_HOURS` throw; empty strings count as unset for the two defaults; `getSummaryModel()` returns `claude-sonnet-5-5`.
- Existing config tests (`loadConfig( {} )` and the exact-shape ones) get a key in their input and the new fields in the expected objects; the same kind of fixture edit as in A.
- Code: add the three env vars; `settings.ts` exports `getSummaryModel`.

### 3.2 Claude client
- Files: `apps/server/package.json` (+ `@anthropic-ai/sdk`), `src/clients/claude.client.ts` + `.test.ts`.
- Tests first (SDK mocked with `vi.mock( '@anthropic-ai/sdk' )`, `config` mocked): the call uses `getSummaryModel()`, `max_tokens: 16000`, a system prompt, and one user message of `[seconds] text` lines (one per segment, seconds floored, blank segments skipped); the client is built with `apiKey`, `timeout: summaryTimeoutMs` and `maxRetries: 1`; a valid `parsed_output` is returned; throws a readable error on null `parsed_output`, on `stop_reason` `max_tokens` or `refusal`, and wraps `Anthropic.APIError` as `Summary request failed: <message>`.
- Code: `SummaryResult` Zod schema (`overview`, `key_points[]`, `quotes[]`, `tags[]`; local to the server, not shared) and `summarizeTranscript( { transcript } )`. Keep the schema free of JSON-schema constraints the API rejects (no `min`/`max`).

### 3.3 Cleanup
- Files: `src/formatters/summary.cleanup.ts` + `.test.ts`.
- Tests first (pure, fixed inputs): quotes kept only if found verbatim in the segment text joined and whitespace-normalised (case-sensitive); key points and quotes with `seconds < 0` or `> meta.duration_seconds` dropped; tags lowercased, spaces to hyphens, other invalid characters stripped, deduped in order, `mnemosyne` dropped, empties dropped, capped at 5.
- Code: `cleanSummary( result, transcript ): SummaryResult`.

### 3.4 Summary formatter
- Files: `src/formatters/summary.formatter.ts` + `.test.ts`.
- Tests first (exact string out): YouTube source gives `[12:34](https://youtu.be/<id>?t=754)` links on points and quotes; non-YouTube gives `[12:34]` plain; `## Summary` always present; empty key points or quotes omit their section; quote lines are `> "…" ([clock](link))`; fractional seconds floor in the link; hour-long clocks render `1:05:20`.
- Code: `formatSummary( summary, source )`, reusing `formatClock` and `youTubeVideoId`.

### 3.5 Service transitions
- Files: `src/services/jobs.service.ts` + `.test.ts`.
- Tests first: `completeTranscription` (`transcribing → summarizing`, stores transcript and `title = meta.title`, 409 from any other status); `completeSummary( id, markdown, tags )` (`summarizing → ready_for_review`, sets `summary_markdown`, `suggested_tags`, `expires_at = now + reviewTtlHours`, clears `error`; 409 otherwise); `failSummary( id, message )` (`summarizing → summary_failed`, sets `error` and `expires_at`); `failJob` now throws `ConflictError` from `ready_for_review`, `summary_failed` and `saved`; `getTranscript( id )` returns the stored transcript (404 unknown job, throws if none stored). Fake timers fix the expiry value.
- Code: the four functions; `completeJob` stays until 3.8 so `runJob` keeps working.

### 3.6 Worker: summarize after transcription
- Files: `jobStore.repository.ts` + test (`findNextRunnableJob`: oldest `queued` or `summarizing`; `findNextQueuedJob` removed), `jobs.service.ts` (`findNextQueuedJob` becomes `findNextRunnableJob`), `src/worker/summarizeJob.ts` + `.test.ts`, `runJob.ts` + `.test.ts`, `worker.ts` + `worker.test.ts`.
- Tests first:
  - repository: picks `queued` and `summarizing`, oldest first, ignores the other statuses.
  - `summarizeJob`: success path (client → cleanup → format → `completeSummary`); any thrown error → `failSummary` with its message; never throws.
  - `runJob`: after transcription calls `completeTranscription`, deletes audio, then runs `summarizeJob`; a pipeline failure still goes to `failJob` and skips summarizing.
  - worker: uses `findNextRunnableJob`.
- Existing `runJob` tests that expect `done` after transcription change to expect `summarizing` or the summary outcome. These are assertion changes caused by the new lifecycle, and I'll list them in the report.
- Code: `summarizeJob( jobId )`; `runJob` pipeline ends in `completeTranscription` and then `summarizeJob`.

### 3.7 Worker: resume `summarizing`
- Files: `runJob.ts` + test (or a dispatch in `worker.ts` if it reads cleaner; tests drive the choice).
- Tests first: a job already `summarizing` runs only the summarize step (download, convert and transcribe mocks not called, no audio dir created); it uses the stored transcript via `getTranscript`; a failure leaves it `summary_failed`; a `queued` job still runs the full pipeline.
- Code: dispatch on `job.status`.

### 3.8 Remove `done`
- Files: shared `job.ts` + test; server `jobs.service.ts` + test (`completeJob` and `done` removed, `renderTranscript` allowed in `ready_for_review` / `summary_failed`, 409 `Transcript not ready` otherwise including `saved`), `jobs.routes.test.ts`, `pipeline.integration.test.ts` (expects `ready_for_review` or `summary_failed`); web `useJob.ts` (stop polling on `ready_for_review`, `summary_failed`, `saved`, `failed`), `JobProgress.tsx` (stages gain `Summarizing` and `Ready for review`; `done` gone), `App.tsx` (`DownloadLinks` shown for `ready_for_review` / `summary_failed`) and their tests/fixtures.
- Tests first: shared rejects `done`; service download allowed/refused per status; `useJob` stops polling on the new end states and keeps polling `summarizing`; `JobProgress` stage states for the new statuses; `App` shows downloads in review and failed-summary states.
- Existing assertions that use `done` change to the new end states (listed in the report).

### 3.9 Integration test
- Files: `src/clients/claude.integration.test.ts`, `vitest.integration.config.ts` (no key injected; the test skips with a clear message when `ANTHROPIC_API_KEY` is unset).
- One real `summarizeTranscript` call on `transcriptFixture` (a few segments). Asserts the result parses and `cleanSummary` keeps the shape. Runs only via `pnpm test:integration`, never in `pnpm test`. I'll run it once if a key is available in the environment; otherwise report it as not run.

## Docs touched
- `tasks.md`: tick Status and add a log line per task; Plan cell ✅ on approval (saved to `docs/v0.2.0/plans/checkpoint-b.md`).
- `apps/server/CLAUDE.md`: Environment list (3.1). The Layers/worker-flow rewrite stays with task 5.2.

## Verification
- Per task: new tests fail first for the stated reason, then pass; full `test`/`lint`/`typecheck` per touched folder.
- End of checkpoint: root `pnpm test`, `lint`, `typecheck`, `build`; start the server with a fake `ANTHROPIC_API_KEY` against a job that fails at download to confirm startup and the config error path; if a real key is available, one end-to-end short video run.
- Report: tasks with commit hashes, per-folder results, existing assertions changed, intermediate-state notes, and whether the integration test ran.
