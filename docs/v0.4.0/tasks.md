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
| 1.1 | Set ADRs 0027–0029 to Accepted (Status lines and the `docs/README.md` index, already listed as Proposed); mark 0014 "Amended by 0027, 0028" in the index and in its file | 0027, 0028, 0029 | ⬜ |
| **Phase 2** | **Shared contracts** | | |
| 2.1 | `summarizer.ts`: `ModelOption`, `ListModelsResponse`, `Settings`, `GetSettingsResponse`, `UpdateSettingsBody`, `PromptVersionSource`, `PromptVersion`, `PromptProfile`, `Guidance`, `ProfileName`, the profile request/response schemas, `SummaryRun`, `SummaryUsage`, `RegenerateSummaryBody` (TRD §3), exported from `index.ts`, with tests | 0027, 0028, 0029 | ⬜ |
| 2.2 | `CreateJobBody` gains `model?` and `profile_id?`; `Job` gains `summary_model`, `prompt_profile_id`, `summary_usage`. Fix every reference in both apps so they compile (server returns NULLs, web fixtures gain the fields); no behaviour yet | 0028, 0029 | ⬜ |
| **Phase 3** | **Server data** | | |
| 3.1 | `repositories/database.ts`: connection, `runMigrations` and the migration list moved out of `jobStore.repository.ts`; `openDatabase` / `closeDatabase` / `getDatabase`; setup file renamed `database.setup.ts`; `server.ts`, shutdown wiring and `vitest.config.ts` updated. Refactor only: moved tests unchanged apart from the renamed functions | — | ⬜ |
| 3.2 | `summarizer/prompts.ts` with `LOCKED_INSTRUCTIONS`, `SEEDED_PROFILES` and `buildSystemPrompt` (TRD §5, text exactly as written there; first check inline code and bold lead-ins round-trip through the editor fixtures and apply TRD §5.1 if not) | 0027 | ⬜ |
| 3.3 | Migration 4: tables, index, job columns, seeds (TRD §2.2). Tested from `user_version = 3` with a job in review and from an empty database | 0027, 0029 | ⬜ |
| 3.4 | `settings.repository.ts`, `promptProfiles.repository.ts`, `summaryRuns.repository.ts`; `jobStore.repository.ts` reads and writes the new job columns (TRD §2.3). Update `apps/server/CLAUDE.md` (repositories line, setup file) | 0027, 0029 | ⬜ |

## Checkpoint B: Phases 4–5 (server summarizer and API)
**Plan:** ⬜ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Server summarizer** | | |
| 4.1 | `summarizer/pricing.ts` (`MODEL_PRICES` filled from Anthropic's pricing page for the active models, `PRICES_CHECKED_ON`, `estimateCostUsd`) and `summarizer/models.ts` (`SHIPPED_DEFAULT_MODEL`) | 0028, 0029 | ⬜ |
| 4.2 | Claude client: `summarizeTranscript( { transcript, model, guidance } )` returns summary and usage; `SummaryError` carries usage (TRD §4.2) | 0027, 0028, 0029 | ⬜ |
| 4.3 | `anthropicModels.client.ts` (`listSummaryModels`: active, paginated, capability filter) and `models.service.ts` (1-hour cache, uncached fallback, `assertKnownModel`). Check the SDK types first (TRD §4.3) | 0028 | ⬜ |
| 4.4 | `settings.service.ts` and `prompts.service.ts` (every rule in TRD §4.4); delete `settings.ts` and its test | 0027, 0028 | ⬜ |
| 4.5 | `summarizeJob` resolves model and prompt and records a run on success and failure through `recordSummaryRun`; `toPublicJob` builds `summary_usage` | 0029 | ⬜ |
| 4.6 | `queueJob( url, options )` (async, validated options stored) and `regenerateSummary` (TRD §4.5) | 0028, 0029 | ⬜ |
| **Phase 5** | **Server API** | | |
| 5.1 | `GET`/`PATCH /api/settings`, `GET /api/models` (routes, controllers) | 0028 | ⬜ |
| 5.2 | Prompt-profile endpoints (TRD §6), each error status tested | 0027 | ⬜ |
| 5.3 | `POST /api/jobs` with options; `POST /api/jobs/:id/regenerate-summary`; extended `Job` in responses | 0028, 0029 | ⬜ |
| 5.4 | Server docs: `apps/server/CLAUDE.md` (summarizer folder, new services and clients, ADR list, no more `settings.ts`), root `CLAUDE.md` architecture paragraph (profiles, model choice, summary runs) | — | ⬜ |

## Checkpoint C: Phase 6 (web Settings)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Web Settings** | | |
| 6.1 | `api/request.ts` (shared `send`/`request`, `jobs.api.ts` unchanged in behaviour); `settings.api.ts`, `models.api.ts`, `prompts.api.ts`; `createJob` options and `regenerateSummary` in `jobs.api.ts`; query keys | 0027, 0028 | ⬜ |
| 6.2 | Hooks: `useSettings`, `useModels`, `usePromptProfiles`, `usePromptVersions`, `useRegenerateSummary` | 0027, 0028, 0029 | ⬜ |
| 6.3 | `/settings` route and the drawer footer Settings item (gear, tooltip when collapsed, current on `/settings`, closes the overlay) above `ColorModeControl` | 0025 | ⬜ |
| 6.4 | `SettingsPage`, `SummarizerDefaults` (saves at once, offline-list notice), `LockedInstructions` | 0027, 0028 | ⬜ |
| 6.5 | `PromptProfiles`, `PromptEditor` (dirty state, limit, save, discard, reset, switch-profile confirm, `beforeunload`), `ProfileNameDialog` (create, rename, 409 message), delete with guards | 0027 | ⬜ |
| 6.6 | `PromptHistory` (list, view, restore) | 0027 | ⬜ |

## Checkpoint D: Phases 7–8 (web jobs, clean-up, verification)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

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
