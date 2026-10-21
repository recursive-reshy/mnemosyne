# Checkpoint C plan: Phases 5–6 (shared, data and server)

Next: **Checkpoint C, task 5.1** (Plan cell ⬜). On approval: save this to `docs/v0.7.0/plans/checkpoint-c.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint C`, push, then start 5.1.

Read for this checkpoint: PRD, TRD §4–§6, §9, `tasks.md`, ADRs 0042, 0044, 0045, 0046, `apps/server/CLAUDE.md`. Work is in `packages/shared` and `apps/server`. Every task: red (watch it fail for the right reason) → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in each touched package (never `--fix`). No test touches the network or the Claude API; agent-client tests mock `fetch`, service and worker tests mock `clients/agent.client.js`.

## Decisions taken while planning (flagged so you can object)
1. **Haiku default is resolved asynchronously** (your answer). The code today does *not* give `extraction_model` a Haiku fallback (it uses `SHIPPED_DEFAULT_MODEL`), so TRD §6.5's "same fallback rule" doesn't describe existing code. `linking_model` = stored value, else newest model id containing `haiku` from `listModels()`, else `SHIPPED_DEFAULT_MODEL`. Because `listModels()` is async and `getSettings()` is sync, **`getSettings()` becomes async** in 6.4 and its callers (`summarizeJob`, `settings.controller`, `feeds`/`gmailSources` services, others found by grep) gain an `await`. This is a design change beyond the TRD → **new ADR 0047** (written in 6.4, added to the task's ADR column and `docs/README.md`; it does not change the PRD). `extraction_model` is left as is. Existing tests change only by mocking/awaiting `getSettings`; each listed in the 6.4 log line.
2. **`getSettings` split in 5.1–6.3:** until 6.4 the new `Settings` fields don't exist server-side, so 5.1 makes them required in the schema and the server's `getSettings` returns placeholders (`linking_enabled: true`, `linking_model: SHIPPED_DEFAULT_MODEL`, `linker_profile_id` = the default profile id) only to satisfy types; 6.4 replaces them. Alternative if you prefer: 5.1 adds the Settings fields as part of 6.4 instead. (TRD puts them in 5.1; I follow the TRD.)
3. **`link_usage` timing:** 5.1 adds `link_usage` to `Job` (nullable) and `StoredJob` omits it, like `summary_usage`; `toPublicJob` returns `null` until 6.2 builds it from `summarizeLinkUsage`. Same for `link_state` (null) and `link_error` (null) until 5.4/6.2.
4. **Migration 7 seeds the linker profile in code**, using `DEFAULT_LINKER_GUIDANCE` from `summarizer/prompts.ts` (so that constant is added in 5.3, not 6.4; 6.4 only wires reset to it). The profile id is random; `linker_profile_id` is found with `findProfileBySeedKey('linker')`.
5. **Linker profile guards live in `prompts.service.ts`** (6.4): `listProfiles`/`createProfile` use `purpose = 'summary'`; `renameProfile`/`deleteProfile` on a `linker` profile → 409; `assertActiveProfile`/`resolvePrompt` for summary use reject the linker profile with 400/`ValidationError`.
6. **Superseded vs expiry:** `completeLinking`/`failLinking` restart the 24 h expiry; `linking` jobs have `expires_at = null`, and `findExpiredJobs` already only sweeps `ready_for_review`/`summary_failed`, so nothing changes there.
7. **`runLinking` execution:** it only moves the job to `linking`; the existing worker (`findNextRunnableJob` now includes `linking`) picks it up, and `runJob` sends a `linking` job straight to `linkJob`.
8. **`linkJob` guidance** comes from `resolveLinkerPrompt()` (current version); `link_runs.prompt_version_id` stores that version id.

## Phase 5 — Shared and data

### 5.1 Shared contracts (ADRs 0045, 0046)
Files: `packages/shared/src/job.ts`, `summarizer.ts`, new `linkSuggestions.ts`, `index.ts`; tests beside them; server fixtures that build a `Job`/`Settings`.
- **Tests first:**
  - `job.test.ts`: `JobStatus` accepts `linking`; `LinkState` accepts the four values and rejects others; `Job` requires `link_state`, `link_error`, `link_usage` (nullable); `LinkRun` and `LinkUsageSummary` accept valid and reject negative/unknown outcome; `run_count` ≥ 1.
  - `linkSuggestions.test.ts` (new): `StoredLinkSuggestion` valid/invalid (bad kind, bad status, non-uuid); `AcceptLinkSuggestionsBody` needs 1..50 uuids and a string `note_markdown`; `RejectLinkSuggestionsBody` 1..50; `RunLinkingBody` accepts `{}` and `{ note_markdown }`; response schemas.
  - `summarizer.test.ts`: `Settings` requires `linking_enabled`, `linking_model`, `linker_profile_id`; `UpdateSettingsBody` accepts `linking_enabled`/`linking_model`, still rejects `{}` and the refine message lists the new keys, ignores/does not accept `linker_profile_id`; `GetSettingsResponse` requires `linker_locked_instructions` (string|null) and `agent_status` (enum).
- **Green:** schemas per TRD §4.1, §4.2, §4.4. `SuggestionKind` is imported from `agent.ts`.
- **Server follow-through (same commit, types only):** `StoredJob` omits `link_usage`; `JobRow`/`toStoredJob` leave link columns out until 5.4; `toPublicJob` adds `link_state: null`, `link_error: null`, `link_usage: null`; `settings.service` placeholders (decision 2); test fixtures gain the fields. Existing tests that list every job status or assert the whole `Job`/`Settings` shape change — listed in the log line.
- Red: schemas missing (type/parse failures).

### 5.2 `packages/shared/src/wikilinks.ts` (ADR 0045)
- **Tests first** (`wikilinks.test.ts`), grouped as TRD §4.3:
  - `findAnchor`: first exact case-sensitive match; word boundaries (`art` not in `start`, Unicode letters/digits); skips front-matter, ATX headings, blockquote lines, fenced code (``` and ~~~), inline code, `[[…]]`, `[text](url)`, `![alt](url)`, autolinks `<https://…>`; falls through to a later eligible occurrence; null when none; returns `{ start, end }` offsets into the full markdown; multi-word anchors; CRLF.
  - `hasWikilink`: alias, heading, case-insensitive; not inside code; no false hit on prefix (`[[Pricing]]` vs `Pricing Strategy`).
  - `insertLink`: `[[T]]` when anchor equals target, else `[[T|anchor]]`; case-only difference keeps the typed anchor text (`[[Pricing Strategy|pricing strategy]]`); `asRelated` forces Related; no anchor → Related; appends to an existing `## Related` list (exact heading, last one wins); creates the section with one blank line before and one trailing newline; already linked → unchanged; front-matter untouched; stale anchor falls to Related; round-trip: `parseNote`/`serializeNote` of the output equals the input apart from the insertion (using `note.ts`).
  - `isStale`: null anchor → false; missing/only-in-excluded-region → true.
- **Green:** mask excluded regions with same-length placeholders (so offsets stay valid), search the masked text; shared helper reused by `hasWikilink`. Pure, no dependencies.
- Red: module missing.

### 5.3 Migration 7 `addLinking` (ADR 0046)
Files: `apps/server/src/repositories/database.ts` (+ test), `apps/server/src/summarizer/prompts.ts` (`DEFAULT_LINKER_GUIDANCE`, text from TRD §6.6).
- **Tests first** (`database.test.ts`): 
  - from empty: `user_version` 7; `prompt_profiles.purpose` exists, defaults `summary`; one `linker` profile (`seed_key = 'linker'`, name `Linker`) with version 1, source `seed`, guidance equals `DEFAULT_LINKER_GUIDANCE`; `link_runs`, `link_suggestions` and their indexes exist; `jobs.link_state`/`link_error` exist.
  - from version 6: build a v6 database (run migrations 1–6, insert a review job, two summary profiles and a summary run), migrate, assert all of it is intact, existing profiles have `purpose = 'summary'`, the linker profile was added once.
  - the name index: a summary profile named "Linker" can be created alongside the linker profile; two active summary profiles with the same name still collide (unique per `purpose, lower(name)`).
  - existing tests that assert the migration count / `user_version` change — listed in the log.
- **Green:** `addLinking` function migration: `ALTER TABLE … ADD COLUMN purpose`, drop `prompt_profiles_active_name`, recreate on `( purpose, lower( name ) ) WHERE deleted_at IS NULL`, create tables and indexes, insert the profile and version 1 in code, add `jobs` columns. Appended to `migrations`.
- Red: `user_version` stays 6 / columns missing.

### 5.4 Repositories (ADRs 0045, 0046)
Files: `promptProfiles.repository.ts`, new `linkRuns.repository.ts`, new `linkSuggestions.repository.ts`, `jobStore.repository.ts` (+ tests), `apps/server/CLAUDE.md`.
- **Tests first:**
  - `promptProfiles`: `ProfileRecord` has `purpose`; `listActiveProfiles( 'summary' )` excludes the linker; `listActiveProfiles( 'linker' )` returns it; `insertProfile` takes a purpose (default summary); `findProfileBySeedKey( 'linker' )`; `countActiveProfiles` counts summary only (so "last remaining profile" still works).
  - `linkRuns`: `insertLinkRun` returns the id; `listLinkRuns( jobId )` ordered by id; `summarizeLinkUsage( jobId )` → undefined when none, else last run, count, totals (nulls treated as 0, `total_cost_usd` null if any run has null cost, same rule as summary usage — I'll check the existing summary rule in `jobs.service` and mirror it).
  - `linkSuggestions`: `insertSuggestions` keeps order as `position`; `listSuggestions` excludes `superseded`, ordered by position; `findSuggestions( jobId, ids )` returns only that job's; `setStatus` sets `decided_at`; `supersedePending` only touches `pending`; `deleteForJob`.
  - `jobStore`: round-trips `link_state`/`link_error`; `findNextRunnableJob` returns a `linking` job; `deleteJob` also removes the job's link runs and suggestions (summary runs unchanged, as today); `markInterruptedJobs` is unchanged (linking recovery is 6.2).
- **Green:** per TRD §5.2; `StoredJob` gains the two link fields (`link_usage` still omitted); `toPublicJob` reads `link_state`/`link_error` from the row. CLAUDE.md repositories line names the new files.
- Red: functions missing.

## Phase 6 — Server

### 6.1 Config and agent client (ADR 0042)
Files: `config.ts` (+ test), `clients/agent.client.ts` (+ test), `.env.example` already has the names from 4.7.
- **Tests first:**
  - `config.test.ts`: `AGENT_SECRET` unset → `config.agent === null`; set (≥ 32 chars) → `{ url: 'http://localhost:8100', secret, timeoutMs: 120000 }`; `AGENT_URL`/`AGENT_TIMEOUT_MS` override; a secret under 32 chars stops startup naming `AGENT_SECRET`; empty strings count as unset.
  - `agent.client.test.ts` (mock `fetch`): `requestLinks` posts to `/v1/link` with `Authorization: Bearer`, JSON body, an abort signal; parses a `linked` and a `failed` reply with the shared `LinkResponse`; transport error → `AgentError('Agent service unreachable')`; timeout → `'Agent service timed out after 120 s'`; 401 → `'Agent service rejected the secret'`; non-JSON or schema-invalid → `'Agent service returned an invalid response'`; the secret never appears in an error message. `fetchInstructions` returns the string, same errors. `checkHealth` → `ok`/`unavailable` (non-200, throw, 2 s timeout), cached 30 s (fake timers) and cache resettable for tests.
  - When `config.agent` is null the client throws `AgentError('Linking isn't configured')` rather than calling fetch.
- **Green:** reuse `clients/http.client.ts` helpers if they fit (check first); `AgentError` class; in-memory health cache with a `clearAgentHealthCache` export for tests.
- Red: module and config key missing.

### 6.2 Job flow (ADRs 0044, 0045)
Files: `services/jobs.service.ts`, new `worker/linkJob.ts`, `worker/runJob.ts`, `services/linkRuns` helpers inside `jobs.service.ts` (+ tests for each).
- **Tests first:**
  - `jobs.service.test.ts`: `completeSummary` → `linking` with `link_state = 'pending'`, `expires_at = null` when linking is enabled and `config.agent` set; otherwise `ready_for_review` with `link_state = 'off'` and an expiry (as 0.6.0); `completeLinking` → `ready_for_review`, `linked`, no error, fresh expiry; `failLinking( id, reason )` → `ready_for_review`, `failed`, reason, fresh expiry; both refuse (409) from any status other than `linking`; `recordLinkRun` computes cost with `estimateCostUsd`, stores no usage on error; `recoverInterruptedJobs` moves `linking` jobs to `ready_for_review` / `failed` / `'Interrupted by restart'` with an expiry and returns the combined count; `regenerateSummary` supersedes pending suggestions; `Job.link_usage` is built from `summarizeLinkUsage` (null when no runs).
  - `linkJob.test.ts` (mock the agent client, `resolveLinkerPrompt`, settings): sends `{ note: { title, tags, folder, body }, model, guidance }` built with `parseNote`; folder is `target_folder ?? default`; `linked` with 3 suggestions → rows inserted `pending` with positions, run recorded `succeeded`, job `linked`; `linked` with 0 → still `linked`; `failed` outcome → run `failed` with usage recorded, job `failed` with the reason; `AgentError` → run recorded without usage, job `failed` with the message; never `failed`/`summary_failed`; a thrown unexpected error also ends in `failLinking`.
  - `runJob.test.ts`: after summarizing, a `linking` job calls `linkJob`; a job found in `linking` skips acquire and summarize; `ready_for_review` after summary (linking off) doesn't call it.
  - `worker.test.ts`/jobStore: `linking` jobs are picked up.
- **Green:** per TRD §6.3.
- Red: functions missing / `completeSummary` still going to `ready_for_review`. Existing `completeSummary`-based tests keep passing by running with linking disabled/`config.agent` null (they default to the 0.6.0 path); any that need an update are listed.

### 6.3 `runLinking`, accept/reject and routes (ADR 0045)
Files: `services/jobs.service.ts`, `controllers/jobs.controller.ts`, `routes/jobs.routes.ts` (+ tests), `errors.ts` unchanged.
- **Tests first:**
  - service: `runLinking` — 409 unless `ready_for_review`; 409 "Linking isn't configured" when `config.agent` null; with `note_markdown` saves it through `updateDraft` first (same validation, so a bad note → 400/422 and nothing else changes); supersedes pending; sets `linking`/`pending`/no error/`expires_at = null`. `acceptSuggestions` — 409 outside review; 409 naming the first id that isn't a pending suggestion of this job (unknown, other job's, already decided, superseded); on success the draft and statuses change in one transaction (inject a failure between them and assert nothing persists), expiry restarted, returns `{ job, suggestions }`; draft validation identical to `updateDraft` (locked properties). `rejectSuggestions` — same checks, statuses only, draft and expiry untouched. `saveJob`/`discardJob` leave suggestion rows alone.
  - routes (Supertest): `GET /api/jobs/:id/link-suggestions` (200, not-superseded, by position, 404 unknown job, 400 bad uuid); `POST …/accept` and `…/reject` (200, 400 on bad body, 409s); `POST /api/jobs/:id/linking` (202 `{ job }`, body optional, 409s).
- **Green:** `inTransaction` from `database.ts` wraps accept; `updateDraft` internals split so the validation/locking part can run inside the transaction (refactor under green).
- Red: routes 404.

### 6.4 Settings, linker prompt routes and ADR 0047 (ADR 0046)
Files: `services/settings.service.ts`, `controllers/settings.controller.ts`, `services/prompts.service.ts`, `controllers/promptProfiles.controller.ts`, `summarizer/prompts.ts` (reset mapping), `docs/decisions/0047-…`, `docs/README.md`, `apps/server/CLAUDE.md`; callers of `getSettings`.
- **Tests first:**
  - `settings.service.test.ts`: `linking_enabled` default true / stored false; `linking_model` stored wins; unset → newest `haiku` id from a mocked `listModels()`; none or fallback list without haiku → `SHIPPED_DEFAULT_MODEL`; `linker_profile_id` is the seeded one; `updateSettings` validates `linking_model` with `assertKnownModel` and stores `linking_enabled`.
  - `settings.routes.test.ts`: GET adds `agent_status` (`not_configured` with no agent, else `checkHealth`) and `linker_locked_instructions` (string, or `null` on `AgentError`; a down agent never fails the request); PATCH accepts the two keys, rejects `linker_profile_id`.
  - `prompts.service.test.ts`/`promptProfiles.routes.test.ts`: list excludes the linker; create names don't collide across purposes; rename/delete of the linker → 409 "The linker prompt can't be renamed or deleted"; versions, save, restore work on it; reset restores `DEFAULT_LINKER_GUIDANCE` (source `reset`); choosing the linker as default profile, summary-profile override, regenerate profile, feed or Gmail source profile → 400; `resolveLinkerPrompt()` returns the current version; `can_reset` true for it.
- **Green:** `getSettings` async + callers awaited (decision 1); `DEFAULT_LINKER_GUIDANCE` seed mapping in `resetProfile` (extend `SEEDED_PROFILES`-style lookup without adding the linker to the summary list); ADR 0047 written (Accepted, dated) and indexed.
- Red: keys and guards missing.

## Checkpoint gate and report
After 6.4: `pnpm -r test`, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm --filter @mnemosyne/server build`, and `apps/agent` tests unchanged. Report per CLAUDE.md "Before you stop": tasks with hashes, results per folder, ADR 0047 (changes TRD §6.5; also note ADRs 0045/0046 precedence if any), and deferrals. Web is untouched in this checkpoint; the new shared required fields may force web test fixtures to compile — if `apps/web` typecheck breaks on `Job`/`Settings`, I'll fix fixtures only (types, no behaviour) in the same 5.1 commit and list it.

## Verification
Per task as above, plus at the end a manual smoke of the server against the real agent container is **not** done here (that's 8.3); the checkpoint relies on mocked-`fetch` and mocked-client tests.
