# Tasks — Mnemosyne v0.4.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package, browser screenshots (light and dark) of any screens touched, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR and add its number to the task's ADR column.
- **No new dependencies** in any package (TRD §1). If the installed `@anthropic-ai/sdk` lacks what TRD §4.3 needs, stop and ask.
- Existing tests pass unchanged, except the changes TRD §8 allows; list each one in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–3 (kick-off, contracts, data)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Set ADRs 0027–0029 to Accepted (Status lines and the `docs/README.md` index, already listed as Proposed); mark 0014 "Amended by 0027, 0028" in the index and in its file | 0027, 0028, 0029 | ✅ |
| **Phase 2** | **Shared contracts** | | |
| 2.1 | `summarizer.ts`: `ModelOption`, `ListModelsResponse`, `Settings`, `GetSettingsResponse`, `UpdateSettingsBody`, `PromptVersionSource`, `PromptVersion`, `PromptProfile`, `Guidance`, `ProfileName`, the profile request/response schemas, `SummaryRun`, `SummaryUsage`, `RegenerateSummaryBody` (TRD §3), exported from `index.ts`, with tests | 0027, 0028, 0029 | ✅ |
| 2.2 | `CreateJobBody` gains `model?` and `profile_id?`; `Job` gains `summary_model`, `prompt_profile_id`, `summary_usage`. Fix every reference in both apps so they compile (server returns NULLs, web fixtures gain the fields); no behaviour yet | 0028, 0029 | ✅ |
| **Phase 3** | **Server data** | | |
| 3.1 | `repositories/database.ts`: connection, `runMigrations` and the migration list moved out of `jobStore.repository.ts`; `openDatabase` / `closeDatabase` / `getDatabase`; setup file renamed `database.setup.ts`; `server.ts`, shutdown wiring and `vitest.config.ts` updated. Refactor only: moved tests unchanged apart from the renamed functions | — | ✅ |
| 3.2 | `summarizer/prompts.ts` with `LOCKED_INSTRUCTIONS`, `SEEDED_PROFILES` and `buildSystemPrompt` (TRD §5, text exactly as written there; first check inline code and bold lead-ins round-trip through the editor fixtures and apply TRD §5.1 if not) | 0027 | ✅ |
| 3.3 | Migration 4: tables, index, job columns, seeds (TRD §2.2). Tested from `user_version = 3` with a job in review and from an empty database | 0027, 0029 | ✅ |
| 3.4 | `settings.repository.ts`, `promptProfiles.repository.ts`, `summaryRuns.repository.ts`; `jobStore.repository.ts` reads and writes the new job columns (TRD §2.3). Update `apps/server/CLAUDE.md` (repositories line, setup file) | 0027, 0029 | ✅ |

## Checkpoint B: Phases 4–5 (server summarizer and API)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Server summarizer** | | |
| 4.1 | `summarizer/pricing.ts` (`MODEL_PRICES` filled from Anthropic's pricing page for the active models, `PRICES_CHECKED_ON`, `estimateCostUsd`) and `summarizer/models.ts` (`SHIPPED_DEFAULT_MODEL`) | 0028, 0029 | ✅ |
| 4.2 | Claude client: `summarizeTranscript( { transcript, model, guidance } )` returns summary and usage; `SummaryError` carries usage (TRD §4.2) | 0027, 0028, 0029 | ✅ |
| 4.3 | `anthropicModels.client.ts` (`listSummaryModels`: active, paginated, capability filter) and `models.service.ts` (1-hour cache, uncached fallback, `assertKnownModel`). Check the SDK types first (TRD §4.3) | 0028 | ✅ |
| 4.4 | `settings.service.ts` and `prompts.service.ts` (every rule in TRD §4.4); delete `settings.ts` and its test | 0027, 0028 | ✅ |
| 4.5 | `summarizeJob` resolves model and prompt and records a run on success and failure through `recordSummaryRun`; `toPublicJob` builds `summary_usage` | 0029 | ✅ |
| 4.6 | `queueJob( url, options )` (async, validated options stored) and `regenerateSummary` (TRD §4.5) | 0028, 0029 | ✅ |
| **Phase 5** | **Server API** | | |
| 5.1 | `GET`/`PATCH /api/settings`, `GET /api/models` (routes, controllers) | 0028 | ✅ |
| 5.2 | Prompt-profile endpoints (TRD §6), each error status tested | 0027 | ✅ |
| 5.3 | `POST /api/jobs` with options; `POST /api/jobs/:id/regenerate-summary`; extended `Job` in responses | 0028, 0029 | ✅ |
| 5.4 | Server docs: `apps/server/CLAUDE.md` (summarizer folder, new services and clients, ADR list, no more `settings.ts`), root `CLAUDE.md` architecture paragraph (profiles, model choice, summary runs) | — | ✅ |

## Checkpoint C: Phase 6 (web Settings)
**Plan:** ✅ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Web Settings** | | |
| 6.1 | `api/request.ts` (shared `send`/`request`, `jobs.api.ts` unchanged in behaviour); `settings.api.ts`, `models.api.ts`, `prompts.api.ts`; `createJob` options and `regenerateSummary` in `jobs.api.ts`; query keys | 0027, 0028 | ✅ |
| 6.2 | Hooks: `useSettings`, `useModels`, `usePromptProfiles`, `usePromptVersions`, `useRegenerateSummary` | 0027, 0028, 0029 | ✅ |
| 6.3 | `/settings` route and the drawer footer Settings item (gear, tooltip when collapsed, current on `/settings`, closes the overlay) above `ColorModeControl` | 0025 | ✅ |
| 6.4 | `SettingsPage`, `SummarizerDefaults` (saves at once, offline-list notice), `LockedInstructions` | 0027, 0028 | ✅ |
| 6.5 | `PromptProfiles`, `PromptEditor` (dirty state, limit, save, discard, reset, switch-profile confirm, `beforeunload`), `ProfileNameDialog` (create, rename, 409 message), delete with guards | 0027 | ✅ |
| 6.6 | `PromptHistory` (list, view, restore) | 0027 | ✅ |

## Checkpoint D: Phases 7–8 (web jobs, clean-up, verification)
**Plan:** ✅ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Web jobs** | | |
| 7.1 | `SummaryOptions` on the submit form; `HomePage` sends only values that differ from the defaults; loading state | 0027, 0028 | ⬜ |
| 7.2 | `SummaryInfo` on the review screen (formatting rules in TRD §7.5) | 0029 | ⬜ |
| 7.3 | **Regenerate summary** in `ReviewActions` and `RegenerateDialog`; the autosave timer is cancelled; the job shows progress, then the new note | 0029 | ⬜ |
| **Phase 8** | **Clean-up and verification** | | |
| 8.1 | Docs: `apps/web/CLAUDE.md` (routes, Settings components, the drawer footer, ADR list), README (Settings, profiles, model choice, cost line, regenerate) | — | ⬜ |
| 8.2 | Version 0.4.0 in every `package.json` (root, server, web, shared) and in the README status line | — | ⬜ |
| 8.3 | Final checks (report results, don't tick until Naresh confirms): `pnpm test`, lint, typecheck in all three packages, web build; migration run against a copy of the real 0.3.1 database; browser checks from TRD §8 in light and dark, wide and narrow; then the real check with Naresh (one real video with Business ideas on Sonnet, regenerate on another profile and model, compare the cost with the Anthropic console) | — | ⬜ |
| 8.4 | `docs/v0.4.0/release-notes.md` (new, changed, upgrade steps including a database backup, known issues, ADRs), linked from `docs/README.md` | — | ⬜ |

---

## Log
- 1.1: ADRs 0027–0029 set to Accepted in their files and the index; 0014 marked "Amended by 0027, 0028" in the index and its file. Docs only.
- 2.1: `packages/shared/src/summarizer.ts` with all TRD §3 schemas, exported from `index.ts`; shared 195 tests, lint and typecheck green. No existing test changed.
- 2.2: `CreateJobBody` gains `model?`, `profile_id?`; `Job` gains `summary_model`, `prompt_profile_id`, `summary_usage`. `StoredJob` omits `summary_usage` (built from runs in 4.5); the repository returns NULL for the two columns until 3.4; `toPublicJob` returns null usage. Test edits (fixtures only): shared `job.test.ts` and `api.test.ts` valid-job literals, server `jobStore.repository.test.ts` `buildJob` and the `queueJob` expected object in `jobs.service.test.ts`, web `job.fixture.ts`. Shared 202, server 493, web 405 tests; lint and typecheck green in all three.
- 3.1: `repositories/database.ts` (connection, `runMigrations`, `migrations`, `openDatabase` / `closeDatabase` / `getDatabase`); setup file renamed `database.setup.ts`; `server.ts` and both vitest configs updated. Tests moved to new `database.test.ts` (open/close, `runMigrations`, migrations 2 and 3) with renamed functions; the 'throws when not open' assertion now expects 'Database is not open' (was 'Job store is not open'); two tests added for `getDatabase`; the last migration-3 test (jobs usable on the final table) stays in `jobStore.repository.test.ts`. Server 495 tests, lint, typecheck and build green. `apps/server/CLAUDE.md` updated.
- 3.2: `summarizer/prompts.ts` (`LOCKED_INSTRUCTIONS`, `SEEDED_PROFILES`, `buildSystemPrompt`), text generated from TRD §5 so it matches exactly. Editor check: new fixture 'bold lead-ins in a list' (bold bullets, inline code, bold paragraph lead-in) round-trips exactly and idempotently, as does the existing inline-code fixture, so TRD §5.1's fallback is not applied. Both prompt files carry a file-level max-len disable (one paragraph per line, verbatim). No existing test changed. Server 504, web 407 tests; lint and typecheck green in both.
- 3.3: migration 4 (`addSummarizerTables` in `database.ts`): tables, partial unique index, job columns, seeds from `SEEDED_PROFILES`, `default_profile_id` setting. Tested from `user_version = 3` with a job in review (untouched, new columns NULL) and from empty. Two existing tests in `database.test.ts` had to change because the final schema changed: the jobs column list gained `summary_model` and `prompt_profile_id`, and the migration 3 helper now upgrades with `migrations.slice( 0, 3 )` so it still checks user_version 3. Server 515 tests, lint and typecheck green.
- 3.4: `settings.repository.ts`, `promptProfiles.repository.ts` (name conflicts returned as `{ ok: false, reason: 'name_taken' }`, `insertVersion` numbers inside a transaction), `summaryRuns.repository.ts`; `jobStore.repository.ts` reads and writes `summary_model` and `prompt_profile_id` (the temporary NULLs from 2.2 removed). `apps/server/CLAUDE.md` repositories lines updated. No existing test changed. Server 551, shared 202, web 407 tests; lint, typecheck and server build green.
- 4.1: `summarizer/pricing.ts` (`MODEL_PRICES`, `PRICES_CHECKED_ON` 2026-10-17, `estimateCostUsd`) and `summarizer/models.ts` (`SHIPPED_DEFAULT_MODEL`, plus `SUMMARY_MAX_TOKENS` per the checkpoint plan). Prices from Anthropic's pricing page for the 11 active models the Models API lists that pass the summary filter (structured outputs, medium effort, max_tokens >= 16000). `claude-haiku-5-5` is deliberately unpriced: its price steps up for prompts over 100,000 tokens, which the table shape can't express, so it shows tokens only. Server 571 tests, lint, typecheck green. No existing test changed.
- 4.2: `summarizeTranscript( { transcript, model, guidance } )` returns `{ summary, usage }`; new `SummaryError` carries `usage` for a response that came back unusable (cut off, declined, unparsable) and none for API errors; system prompt is `buildSystemPrompt( guidance )`. Test edits: `claude.client.test.ts` (signature, usage in the mock reply, new error tests) and `claude.integration.test.ts` (not run). Bridge to keep the build green until 4.5: `summarizeJob.ts` passes the shipped default model and the General guidance (the 0.3 behaviour) and `summarizeJob.test.ts` mock now resolves `{ summary, usage }` and asserts `model`/`guidance` in the call. Server 576 tests, lint, typecheck green.
- 4.3: SDK check passed (installed 0.133.0 has `models.list` with the `lifecycle` filter, auto-paging, and `capabilities`). `clients/anthropicModels.client.ts` (`listSummaryModels`) and `services/models.service.ts` (`listModels` with 1-hour cache, uncached fallback to the saved or shipped default, `assertKnownModel`, `clearModelCache` for tests). Reads `default_model` from the settings repository directly to avoid a cycle with `settings.service`. Server 595 tests, lint, typecheck green. No existing test changed.
- 4.4: `prompts.service.ts` (every rule in TRD §4.4) and `settings.service.ts`; `settings.ts` and `settings.test.ts` deleted as the TRD says (the old `getSummaryModel` had no callers left after 4.2). `prompts.service` reads `default_profile_id` from the settings repository to keep `settings.service` on top of the dependency order. Server 631 tests, lint, typecheck green. No other existing test changed.
- 4.5: `summarizeJob` resolves the job's model (else the default) and prompt (else the default profile), calls the client with the guidance, and records one run on success and on failure through `recordSummaryRun` (failed runs keep the tokens from a `SummaryError`); `toPublicJob` now builds `summary_usage` (last run, count, sums, null total cost when a run with tokens is unpriced). The 4.2 bridge in `summarizeJob.ts` is gone. Test edits to existing `summarizeJob.test.ts`: the client module is now mocked with `importOriginal` so `SummaryError` stays real, and new tests added; the earlier 'sends the stored transcript' test already asserts the 4.2 call shape. Server 645 tests, lint, typecheck green.
- 4.6: `queueJob( url, options )` is async and validates `model` (`assertKnownModel`) and `profile_id` (new `assertActiveProfile` in `prompts.service`, also used by `settings.service`); `regenerateSummary( id, choices )` allows only `ready_for_review`, keeps the note, `target_folder` and earlier choices, validates, and moves to `summarizing`. The controller awaits and passes the options. Approved ripple on existing tests: `await` added to every `queueJob(` call (jobs.service, jobs.routes, runJob, worker, summarizeJob tests) and to their now-async helpers (`queueJobAt`, `seedJobAt`, `queueSummarizing`, …), with enclosing callbacks made `async`; no assertion changed. `jobs.service.test.ts` and `summarizeJob.test.ts` mock `models.service` so no test reaches the network. Server 666 tests, lint, typecheck, build green.
- 5.1: `GET`/`PATCH /api/settings` and `GET /api/models` (routes, controllers, mounted in `app.ts`); tested through `app.ts` with the models client mocked. Server 676 tests, lint, typecheck green. No existing test changed.
- 5.2: the eight prompt-profile endpoints (`promptProfiles.routes.ts`, `promptProfiles.controller.ts`); every row of TRD §6 tested through `app.ts` with each error status (a non-numeric or non-positive `:versionId` returns 400 from the controller's local Zod schema). Server 710 tests, lint, typecheck green. No existing test changed.
- 5.3: `POST /api/jobs/:id/regenerate-summary` (202, 400, 404, 409) added; `POST /api/jobs` options were already wired in 4.6 and are now covered through `app.ts` (stored on the job; 400 for unknown model, unknown profile, malformed id). Extended `Job` (`summary_model`, `prompt_profile_id`, `summary_usage`) is returned by every job endpoint and parsed with the shared schema in the tests. `jobs.routes.test.ts` now mocks the models client (setup edit only; no assertion changed). Server 727 tests, lint, typecheck green.
- 5.4: `apps/server/CLAUDE.md` (ADR list adds 0027–0029; `settings.ts` gone; `summarizer/` folder; settings, prompts and models services; `anthropicModels` client; regenerate and summary runs in the worker note) and the root `CLAUDE.md` architecture paragraph (profiles, model choice, summary runs, regenerate). Docs only.
- 6.1: `api/request.ts` (`send`, `request` moved out of `jobs.api.ts`, which behaves as before: its existing tests pass unchanged); `settings.api.ts`, `models.api.ts`, `prompts.api.ts`; `createJob( url, options? )` (options added to the body only when defined) and `regenerateSummary` in `jobs.api.ts`; `settingsKeys`, `modelKeys`, `promptKeys` in `queryKeys.ts`. `test-support/summarizer.fixture.ts` was created here, not in 6.2, because the API tests already need it. `vault.api.ts` keeps its own copy of the helpers (outside the task list). Web 436 tests, lint, typecheck green.
- 6.2: `useSettings`, `useModels` (one-hour `staleTime`), `usePromptProfiles` (list plus the six mutations), `usePromptVersions`, `useRegenerateSummary`. Every profile mutation invalidates `promptKeys.profiles` once, which is a prefix of each profile's versions key, so versions refresh too (simpler than the plan's two invalidations). `mutationFn`s wrap the API calls in arrows because TanStack passes a context argument. `useUnsavedChangesWarning` comes with 6.5. Web 458 tests, lint, typecheck green. No existing test changed.
- 6.3: drawer footer is now a `Divider`, the Settings item (gear, tooltip when collapsed, current on `/settings`, closes the narrow overlay), then `ColorModeControl`; `NAV_ITEMS` untouched. The item markup moved into a private `NavItem` used by both the module items and Settings (existing NavDrawer tests pass unchanged). `/settings` route in `App.tsx` with a heading-only `SettingsPage` (title and section heading) for 6.4 to complete. Web 465 tests, lint, typecheck green. No existing test changed.
- 6.4: `SettingsPage` (title and Summarizer heading always shown; loading status or error alert instead of the sections), `SummarizerDefaults` (two selects that save at once, 'Saved' status, error alert, offline-list notice, disabled while loading, a retired saved model still listed by id), `LockedInstructions`. New `test-support/mutationStub.ts` for component tests. Existing-test edit: `App.test.tsx` mocks the `SettingsPage` module so the route test doesn't depend on the page's data hooks (the 6.3 case there now asserts only the route). Web 482 tests, lint, typecheck green.
- 6.5: `PromptProfiles` (picker with the default marked, owns the selection and the draft; switch-with-edits confirm; save; reset; delete with guards), `PromptEditor` (Guidance field, count against 20,000, 'Unsaved changes' text, Save/Discard/Reset with a confirm), `ProfileNameDialog` (create with prefilled guidance, rename; the server's 409 message shows in the dialog), plus the planned extras `ConfirmDialog` and `useUnsavedChangesWarning`, and a small `ProfileActions` (New/Rename/Delete with the tooltip reason) split out to keep `PromptProfiles` near 150 lines. Mounted in `SettingsPage`; `SettingsPage.test.tsx` mocks it. Dialogs are checked after their exit transition (tests wait for the dialog to leave). Web 537 tests, lint, typecheck green. No existing test changed apart from the `SettingsPage` mock.
- 6.6: `PromptHistory` (versions newest first with number, 'current' marker, source label, date and first line; choose one to read it in a read-only field; **Restore this version** on every version but the current one; loading, load-error and restore-error states), mounted under the editor; restoring clears any local edit. The delete-guard rule moved to `ProfileActions/deleteBlockedReason.ts` (with tests) to keep `PromptProfiles` under the repo's 150-line lint cap. Web 554 tests, lint, typecheck green. No existing test changed.
