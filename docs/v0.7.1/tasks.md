# Tasks — Mnemosyne v0.7.1

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package (and `test:browser` for web), browser screenshots (light and dark) of any screens touched, `pnpm e2e` from checkpoint F on, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR (from 0054) and add its number to the task's ADR column.
- **This release changes no job behaviour** (PRD §4). If a task finds a real bug in 0.7.0 behaviour, stop and ask; don't fix it in passing.
- **Work in `apps/agent` follows `apps/agent/CLAUDE.md`** (house style, no formatter, `ruff check` without `--fix`).
- **Dependencies:** only the ones in TRD §1, each added by the task that first uses it, plus the upgrades of checkpoint G. Check its real API against the TRD first; if it differs in a way that changes the design, stop and ask.
- **No test touches the network, the Claude API or a real vault.** The e2e stack uses local fakes and temp folders.
- Existing tests pass unchanged, except the changes TRD §10.1 allows; list each one in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–2 (kick-off and job lifecycle)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Set ADRs 0048–0053 to Accepted (Status lines and the `docs/README.md` index); `docs/README.md` "current version" line to 0.7.1 (it still says 0.6.0) and the v0.7.1 entry to "in progress". The root `CLAUDE.md` already points at 0.7.1 (updated with these docs) | 0048–0053 | ✅ |
| **Phase 2** | **Job lifecycle** | | |
| 2.1 | `jobs/lifecycle.characterization.test.ts` against the unchanged 0.7.0 services: every service function from every status and source, recording which moves succeed, which give 409 and what `expires_at` becomes. Green on 0.7.0 code (it pins today's behaviour; the red step is a deliberately wrong expectation, shown failing, then corrected). Any move that looks like a bug: stop and ask (TRD §2.4) | 0048 | ✅ |
| 2.2 | `jobs/lifecycle.ts`: `STATES`, `MOVES`, `canMove`, `assertMove`, `statusesWhere`, and the link-state table, matching 2.1's findings; `lifecycle.test.ts` (TRD §2.2) | 0048 | ✅ |
| 2.3 | `moveTo` enforces moves and sets expiry from the target state; the hand-written status checks in `jobs.service.ts` replaced by `assertMove`; `nextStep` deleted, `markStatus` on `canMove`; callers stop passing `expires_at` except the autosave reset; 2.1 still green (TRD §2.3) | 0048 | ✅ |
| 2.4 | `jobStore.repository.ts` status lists from `statusesWhere`, recovery updates from `onRestart`, as bound parameters; ADR 0048's table and both Mermaid diagrams updated to the final version (TRD §2.3) | 0048 | ✅ |

## Checkpoint B: Phase 3 (structured logs)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 3** | **Structured logs** | | |
| 3.1 | `pino` added; `config.logLevel` (`LOG_LEVEL`); `logger.ts` (levels as labels, ISO time, `service`, `mixin`, redaction) and `logContext.ts` (`withLogContext`); redaction tests (TRD §3.1) | 0049 | ✅ |
| 3.2 | Every `console.*` in `apps/server/src` to the logger with fields (`config.ts` excepted); job, feed and Gmail-source contexts in the worker and pollers; `assertMove` refusals logged; `no-console` in `apps/server/eslint.config.js`; `pino-pretty` in the `dev` script (TRD §3.1) | 0049 | ✅ |
| 3.3 | `middleware/requestLog.ts`: method, route pattern, status, duration; health and status skipped (TRD §3.1) | 0049 | ✅ |
| 3.4 | Agent: `logging_setup.py` (JSON formatter, `job_id_var`, filter, uvicorn loggers), `LOG_LEVEL` in `config.py`, the `X-Job-Id` middleware, the no-note-text test; server: `X-Job-Id` on `requestLinks`; `LOG_LEVEL` in Compose and both `.env.example` files (TRD §3.2–3.3, §8) | 0049 | ✅ |

## Checkpoint C: Phase 4 (data router and Settings tabs)
**Plan:** ✅ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Data router and Settings tabs** | | |
| 4.1 | `routes.tsx`, `createBrowserRouter` + `RouterProvider` in `main.tsx`, `App` as the layout route; `test-support/renderWithRouter`; existing routing tests moved to the memory data router (TRD §4.1) | 0052 | ✅ |
| 4.2 | `useUnsavedChangesGuard` (beforeunload + `useBlocker` + `ConfirmDialog`) replaces `useUnsavedChangesWarning`, used by `useAutosaveDraft` (TRD §4.3) | 0052 | ⬜ |
| 4.3 | `SettingsLayout` with routed MUI tabs and redirects; `ModelsTab` (`SummarizerDefaults`, `LinkingSettings` without the linker prompt); `SourcesTab` (`FeedSettings`, `GmailSettings`; Status panel slot for 6.2); `SettingsPage` removed; drawer item current on `/settings/*` (TRD §4.2, §4.4) | 0052 | ⬜ |
| 4.4 | `PromptsTab`, `PromptList`, `PromptPanel` (summary profiles and `linker`, history, reset, locked instructions, the guard); `PromptProfiles` dropdown and `LinkerPrompt` removed; full-width layout and the narrow-window list/editor screens; `apps/web/CLAUDE.md` (TRD §4.2–4.4) | 0052 | ⬜ |

## Checkpoint D: Phases 5–6 (health data, server and Status panel)
**Plan:** ⬜ `plans/checkpoint-d.md`

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 5** | **Health data and server** | | |
| 5.1 | Shared `status.ts`: `HealthKind`, `HealthState`, `StatusRow`, `GetStatusResponse`, `HealthError`, `GetHealthErrorsResponse`, `BackupResult` (TRD §5.1) | 0050 | ⬜ |
| 5.2 | Migration 8 `addHealth`: tables, index, carry-over of feed and Gmail-source check data, dropped columns; tested from version 7 with data and from empty (TRD §5.2) | 0050 | ⬜ |
| 5.3 | `health.repository.ts`; `feeds` and `gmailSources` repositories read check data through the join (due queries included) and stop writing it; soft delete removes health rows (TRD §5.3) | 0050 | ⬜ |
| 5.4 | `health.service.ts` `recordCheck`, called by the feed check, the Gmail source check and the Gmail token refresh; `checkWhisperHealth`; `checkHealth( { fresh } )`; `worker/serviceMonitor.ts` with `STATUS_CHECK_INTERVAL_MINUTES`, started and stopped with the other workers. Record in the log line what the real whisper-server answers on `/health` (TRD §5.4) | 0050 | ⬜ |
| 5.5 | `status.service.ts` (states, names, order) and `GET /api/status`, `POST /api/status/refresh`, `GET /api/status/:kind/:id/errors` (TRD §5.4) | 0050 | ⬜ |
| **Phase 6** | **Status panel** | | |
| 6.1 | `api/status.api.ts`, `statusKeys`, `useStatus`, `useRefreshStatus`, `useHealthErrors` (TRD §5.5) | 0050 | ⬜ |
| 6.2 | `StatusPanel` in `SourcesTab`: rows, icon + text states, error history, Reconnect on the Gmail row; agent-status block removed from `LinkingSettings` (TRD §5.6) | 0050 | ⬜ |
| 6.3 | `NavDrawer` Settings badge with the failing count and accessible name, collapsed and expanded (TRD §5.6) | 0050 | ⬜ |

## Checkpoint E: Phase 7 (backups)
**Plan:** ⬜ `plans/checkpoint-e.md`

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Backups** | | |
| 7.1 | `BACKUP_DIR` in config; the `/backups` mount and `BACKUP_DIR` in Compose; `BACKUP_HOST_PATH` in `.env.example`, `BACKUP_DIR` in `apps/server/.env.example`; `docker compose config` passes (TRD §6.1) | 0051 | ⬜ |
| 7.2 | `backup.service.ts` `runBackup` (single-flight, Singapore-time name, `.partial`, `quick_check`, rename, `recordCheck`) and `POST /api/backups` (TRD §6.2) | 0051 | ⬜ |
| 7.3 | Restore guard in `openDatabase` and the exit in `server.ts` (TRD §6.3) | 0051 | ⬜ |
| 7.4 | `useRunBackup` and **Back up now** on the backup row: pending, result line, error (TRD §6.4) | 0051 | ⬜ |
| 7.5 | `docs/backups.md` with the real volume and file names, linked from the README (TRD §6.5). The restore drill itself is done with Naresh in 10.3 | 0051 | ⬜ |

## Checkpoint F: Phase 8 (end-to-end smoke test)
**Plan:** ⬜ `plans/checkpoint-f.md`

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **End-to-end smoke test** | | |
| 8.1 | Check neither Anthropic client sets a base URL (stop and ask if one does); `e2e/` package in the workspace with `@playwright/test`, `playwright.config.ts`, lint and typecheck; `fakes/server.mjs` and its Dockerfile with fixtures, and unit tests of its routing (TRD §7.1–7.2) | 0053 | ⬜ |
| 8.2 | `docker-compose.e2e.yml`, `run.sh` (temp folders, random secret, `up --wait`, always `down -v`), root `pnpm e2e`; a first spec that only loads the home page (TRD §7.3) | 0053 | ⬜ |
| 8.3 | `article.spec.ts`, `feed.spec.ts`, `status.spec.ts`; root `CLAUDE.md` "Before you stop": `pnpm e2e` at the end of every checkpoint (TRD §7.4–7.5) | 0053 | ⬜ |

## Checkpoint G: Phase 9 (dependency refresh)
**Plan:** ⬜ `plans/checkpoint-g.md`

The plan for this checkpoint is written after 9.1 has run: 9.1's table decides which major-upgrade tasks are added after 9.4 (one per major, as 9.6, 9.7, …).

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 9** | **Dependency refresh** | | |
| 9.1 | `pnpm -r outdated` and `uv tree --outdated`; the table (package, app, current, latest, minor or major) into `plans/checkpoint-g.md`. No changes (TRD §9) | | ⬜ |
| 9.2 | Minor and patch upgrades: `packages/shared` and `apps/server` | | ⬜ |
| 9.3 | Minor and patch upgrades: `apps/web` and `e2e` | | ⬜ |
| 9.4 | Minor and patch upgrades: `apps/agent` (`uv lock --upgrade`, exact pins respected) | | ⬜ |
| 9.5 | Base images and the `uv` pin; image sizes before and after in the log line | | ⬜ |

## Checkpoint H: Phase 10 (clean-up and release)
**Plan:** ⬜ `plans/checkpoint-h.md`

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 10** | **Clean-up and release** | | |
| 10.1 | README: Settings tabs, the Status panel, backups (link to `docs/backups.md`), logs and `LOG_LEVEL`, `pnpm e2e`, new variables, troubleshooting; root `CLAUDE.md` architecture paragraph (lifecycle, status, backups) | 0048–0053 | ⬜ |
| 10.2 | Version 0.7.1 in every `package.json`, `apps/agent/pyproject.toml` and the README status line | | ⬜ |
| 10.3 | Final checks: all tests, lint, typecheck, build, browser tests, the agent's `docker` tests, `pnpm e2e`, `docker compose build`. With Naresh: take a backup of the real 0.7.0 database with 0.7.0 still running (copy from the volume), run migration 8 on a copy; in Docker, Settings tabs and the guard, the Status panel with the agent stopped and whisper-server stopped, **Back up now**, the restore drill from `docs/backups.md`, and following one job through `docker compose logs` by its ID | 0048–0053 | ⬜ |
| 10.4 | `release-notes.md` (upgrade steps: back up the database first, add `BACKUP_HOST_PATH` to `.env`, `docker compose up --build`), linked from `docs/README.md` | 0051 | ⬜ |

---

## Log


- 1.1 ✅ ADRs 0048–0053 set to Accepted (Status lines and index); `docs/README.md` current version 0.7.1, v0.7.1 in progress.
- 2.1 ✅ `jobs/lifecycle.characterization.test.ts` (29 tests) pins 0.7.0 on every service function × status × source, plus runnable, active, sweep and restart-recovery sets. Red step shown: a deliberately wrong `summary_failed → saved` expectation failed, then was corrected. Findings that differ from TRD §2.2 (stop-and-ask before 2.2): `failJob` succeeds only from queued, downloading, converting, transcribing, fetching, summarizing and linking (not from ready_for_review or summary_failed); `summary_failed` is not editable (updateDraft, accept and reject give 409); `summary_failed → saved` does not exist. server: 1834 tests, lint and typecheck green.
- 2.2 ✅ `jobs/lifecycle.ts` (STATES, MOVES, canMove, assertMove, statusesWhere with an optional value for `onRestart`, LINK_STATES, LINK_MOVES, assertLinkMove) and `lifecycle.test.ts` (18 tests, red first on the missing module). The table reproduces 0.7.0 as Naresh decided: `failJob` from seven states, `editable` only `ready_for_review`, no `summary_failed → saved`. Nothing calls the module yet. server: 1852 tests, lint and typecheck green.
- 2.3 ✅ `moveTo` calls `assertMove` and sets `expires_at` from the target state (only the autosave reset in `updateDraft` still passes it); `nextStep` and `finalStatuses` deleted; `markStatus` and `failSummary` and `failJob` rely on `moveTo`. New `jobs/lifecycle.enforcement.test.ts` (15 tests, red first: with `assertMove` mocked to refuse, every service move must refuse). Deviation from TRD §2.3: the table is a graph of moves, not a per-function precondition (for example `summarizing → ready_for_review` is legal, but `failLinking` must start from `linking`), so `completeSummary`, `completeLinking`, `failLinking`, `retrySummary`, `regenerateSummary`, `runLinking`, `updateDraft`, `acceptSuggestions` and `rejectSuggestions` keep a one-line `assertFrom` that names their start status and then asks the table; `completeAcquisition` keeps its kind check; `submitPastedText` keeps its own message. Messages unchanged. Existing tests changed: none; the 2.1 test passes unchanged. `apps/server/CLAUDE.md` updated. server: 1867 tests, lint and typecheck green.
- 2.4 ✅ `jobStore.repository.ts` builds the runnable, active and expiring lists and both recovery updates from `statusesWhere()` as bound parameters; new `repositories/jobStore.lifecycle.test.ts` (5 tests, red first: with the table replaced by one naming only `saved`, each query must follow it). ADR 0048 now holds the final table and both Mermaid diagrams, and records three corrections to the TRD (`failJob` from seven states, `editable` only `ready_for_review`, no `summary_failed → saved`) and the `assertFrom` guard; TRD §2.2 updated to match at Naresh's request (table, moves, `statusesWhere( key, value )`). Existing tests changed: none. server: 1872 tests, lint, typecheck green; build run at the checkpoint end.
- 3.1 ✅ `pino` and `pino-pretty` added; `config.logLevel` (`LOG_LEVEL`, default `info`, pino levels plus `silent`); `logContext.ts` (`withLogContext` merges nested contexts, `getLogContext`); `logger.ts` (`createLogger( destination?, level? )` plus the shared `logger`; label levels, ISO time, `service`, context `mixin`, `*.`-path redaction). New tests: `logger.test.ts` (12), `logContext.test.ts` (5), 9 in `config.test.ts`. Existing tests changed: `config.test.ts` (the two full-object `toEqual` checks gained `logLevel: 'info'`). server: 1897 tests, lint, typecheck green.
- 3.2 ✅ All 25 `console.*` calls outside `config.ts` now use the logger with a fixed message and fields; `config.ts` keeps its one `console.error` with an eslint-disable and a reason. `no-console` is an error for `src/**/*.ts` (the CLI scripts in `scripts/` keep `console`). Contexts: the worker wraps each `runJob` in `{ job_id }`; `checkDueFeeds` and `checkDueSources` wrap each check in `{ feed_id }` / `{ gmail_source_id }`; `jobs.service.ts` logs a refused move (`Job move refused` with from, to, source_type) before the ConflictError. `dev` pipes through `pino-pretty`; vitest runs with `LOG_LEVEL=silent`. Email subjects and feed item titles are logged where they were before (names only, no bodies). Existing tests changed (console spies now spy on the logger, assertions on `( fields, message )`): errors, video.adapter, intakePoller, worker, sweeper, runJob, gmail.routes, models.routes, gmail/auth, gmailSources.check, feeds.service, prompts.service, models.service; the `config.js` mocks in app.web, video.adapter, runJob, sweeper and gmail/auth gained `logLevel` because the logger reads it at import. New tests: context in worker, feeds and Gmail sources; refused-move log. Noted, not fixed: `routes/promptProfiles.routes.test.ts` and others reach the real Anthropic API with the test key (a 401 is logged), against the no-network rule; needs Naresh's call. server: 1901 tests, lint, typecheck, build green.
- 3.3 ✅ `middleware/requestLog.ts` (`createRequestLog( log )` and the default `requestLog`, mounted on `/api` first in `app.ts`): one `Request` line on `finish` with method, route pattern (path when unmatched), status and `duration_ms`; `info` below 500, `error` from 500; `/api/health` and `/api/status` skipped; no query string, header or body. 5 new tests in `middleware/requestLog.test.ts` (red first on the missing module). Existing tests changed: none. server: 1906 tests, lint, typecheck, build green.
- 3.4 ✅ Agent: `logging_setup.py` (`JsonFormatter` with `time`, `level`, `service`, `msg`, extras and `err`; `job_id_var`; `JobIdFilter`; `configure_logging( level )` on `mnemosyne_agent`, `uvicorn` and `uvicorn.access`, idempotent); `LOG_LEVEL` in `config.py` (the server's names, case-insensitive, default `info`, invalid is a `ConfigError`); the request middleware reads `X-Job-Id` only when it is a UUID and resets it after. The request line text is unchanged and its fields (method, path, status, duration_ms, outcome, tool_calls, tokens) are also passed as `extra`, so the existing caplog tests pass unchanged. Server: `requestLinks` sends `X-Job-Id` from the log context (not on `fetchInstructions`). `LOG_LEVEL` in Compose for both services, the root and server `.env.example` (the agent has no `.env.example`, so TRD §8's "both" is read as these two); logging sections in both `CLAUDE.md` files. New agent tests: `test_logging_setup.py` (12), 3 in `test_config.py` (plus parametrized), 4 in `test_main.py`, 1 in `test_link_route.py`; 2 server tests in `agent.client.test.ts`; an autouse logger-restore fixture in `tests/conftest.py`. Existing tests changed: none. server: 1908 tests, lint, typecheck, build green; agent: 244 tests, pyright, ruff green; `docker compose config` passes.
- 4.1 ✅ `routes.tsx` (route objects; `App` is the layout route with an `<Outlet>`), `main.tsx` on `createBrowserRouter` + `RouterProvider`, `test-support/renderWithRouter` (renders the real routes; own test, red first on the missing module). `renderWithClient` and `renderHookWithClient` now run inside a memory data router (one `Harness`, router created once so `rerender` keeps state), signatures unchanged, so their ~77 callers are untouched. Existing tests changed: `App.test.tsx` (to `renderWithRouter`; the Settings mock and assertions unchanged). Deviation from the plan: `useGmailRedirectNotice.test.tsx` keeps its `MemoryRouter` (the hook needs no data router). The `/settings` stays on the current `SettingsPage` until 4.3. web: 1183 unit tests, 22 browser tests, lint, typecheck green.
