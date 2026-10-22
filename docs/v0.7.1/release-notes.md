# Mnemosyne v0.7.1 — Release notes
v0.7.1 is a consolidation release. Settings is split into tabs, a Status panel shows whether every source and service is working, **Back up now** copies the database to a folder on your Mac, and the internals behind the seven feature releases are tightened: one enforced job lifecycle, JSON logs that follow a job across both services, an end-to-end smoke test and a dependency refresh. Transcribing, summarizing, linking, reviewing and saving behave as in 0.7.0.

## New

### Settings in tabs
- Three tabs, **Prompts**, **Models** and **Sources**, each at its own address (`/settings/prompts`, `/settings/models`, `/settings/sources`). `/settings` and unknown tabs go to Prompts. The drawer's Settings item is current on every tab (ADR 0052).
- **Prompts** has a list on the left (summary profiles, then the linker prompt) and the selected prompt's editor, history, reset and locked instructions on the right. The selected prompt is in the address, so a reload keeps it. On a narrow window the list and the editor are separate screens. New, Rename, Delete and Set as default work from the list.
- Leaving a tab, a prompt or a page with unsaved prompt edits asks first; so does Back.

### Status panel
- The top of **Settings → Sources** lists the backup, the agent service, whisper-server, the Gmail connection, every Gmail source and every feed, each with its last check, its last success ("never" if it hasn't worked) and **OK**, **Failing** (with the latest error) or **Off**. Open a failing row for its last 5 errors. A revoked or expired Gmail connection says so and has **Reconnect** (ADR 0050).
- The agent service and whisper-server are checked while the panel is open and every 2 minutes in the background (`STATUS_CHECK_INTERVAL_MINUTES`). Either one shows as Failing whenever it is down, even if no job needs it.
- When anything is failing, a warning badge with the count appears on Settings in the drawer, from any page. It carries the count in its accessible name and isn't colour alone.

### Backups
- **Back up now** on the Backups row writes a consistent copy of the database to `BACKUP_HOST_PATH` while the app runs, as `mnemosyne-YYYYMMDD-HHmmss.db` (Singapore time), checked with SQLite's `quick_check` before it gets its name. Manual only, no schedule; the app never deletes a backup (ADR 0051).
- The key is never written there: restoring the Gmail connection also needs `TOKEN_ENCRYPTION_KEY` from `.env`. [`docs/backups.md`](../backups.md) says what is and isn't in a backup, and the restore steps (tried on a scratch volume).
- The server refuses to start on a database from a newer version of itself, and says so, instead of running against it.

### Logs
- The server (pino) and the agent write one JSON object per line, with a level, a time and a service. A job's ID is on every line about it, and the agent's lines for a link run carry it too (`X-Job-Id`). Pollers log their feed or source; requests log method, route, status and duration. `LOG_LEVEL` sets the level (default `info`). No bodies, note or transcript text, prompts, email content or tokens are logged (ADR 0049).
- Follow one job: `docker compose logs mnemosyne agent | grep <job id>`.

### End-to-end smoke test
- `pnpm e2e` builds the Compose stack under its own name and port (3101) with a temporary vault and backups folder, serves pages, a feed, Whisper's health and the Anthropic API from local fakes, and runs four Playwright specs: an article through summary, linking, accept and save; a feed and its inbox; the Status panel and **Back up now**; the home page. It tears the stack down with its volume and never touches your running instance (ADR 0053). It is slow, so it isn't part of `pnpm test`.

## Changes
- **One job lifecycle** (ADR 0048). All statuses and allowed moves live in `apps/server/src/jobs/lifecycle.ts`, with two Mermaid diagrams in the ADR. `moveTo` enforces it, sets expiry from the target state and logs a refused move; the repository's status lists come from it. Behaviour is the same as 0.7.0, pinned by a characterization test written against 0.7.0 first. The ADR corrects TRD §2.2 in three places (`failJob` is allowed from seven states, only `ready_for_review` is editable, and there is no `summary_failed → saved`), and the TRD has been updated to match.
- **Migration 8** adds `health_status` and `health_errors`, moves the feed and Gmail-source `last_checked_at` and `last_error` into them and drops those four columns. The feed and source API shapes are unchanged. The migration can't be undone: to go back to 0.7.0, restore a backup taken before the upgrade.
- **`BACKUP_HOST_PATH` is required by Compose.** New optional variables: `LOG_LEVEL`, `STATUS_CHECK_INTERVAL_MINUTES` (both services' `.env.example`s) and, for the server outside Docker, `BACKUP_DIR`.
- New endpoints: `GET /api/status`, `POST /api/status/refresh`, `GET /api/status/:kind/:id/errors`, `POST /api/backups`. `agent_status` stays in `GET /api/settings` for the review screen's linking notice; the Models tab no longer shows it.
- The agent's reachability moved from Settings → Linking to the Status panel. The Gmail warning dot on the drawer became the general badge.
- The restore commands add `chown 1000:1000` (the app runs as `node`) and mount the backups folder read-only, a small change from TRD §6.5.
- Dependencies refreshed: React 19.3.1, react-router 8.5.0, TanStack Query 5.104.5, MUI X Tree View 9.16.0, Vitest 5.0.5, ESLint 10.13.0 and typescript-eslint 8.72.0, `@anthropic-ai/sdk` 0.137.0 (server), FastAPI 0.159.1 and `anthropic` 2.1.0 (agent; no code change was needed), `uv` 0.13.5 in the agent image. Base images were pulled fresh (Node 24.22.1, Python 3.14.9); the agent image went from 306 MB to 290 MB.
- Held on purpose: TypeScript 6 (typescript-eslint doesn't support 7 yet, ADR 0010) and `@types/node` 24 (the runtime is Node 24).

## Upgrading
1. **Back up your database first**, with 0.7.0 still running. Migration 8 can't be undone.
   ```bash
   docker compose stop
   mkdir -p ~/mnemosyne-backup
   docker run --rm -v mnemosyne_mnemosyne-data:/data -v ~/mnemosyne-backup:/backup alpine sh -c 'cp /data/mnemosyne.db* /backup/'
   ```
2. Create a folder for backups and add it to the `.env` at the repo root: `BACKUP_HOST_PATH=/Users/<you>/mnemosyne-backups`. `docker compose` stops with a message until it is set. Point it at a synced folder if you want the copies off this machine.
3. Rebuild: `docker compose up -d --build`. On startup the database migrates from version 7 to version 8; jobs, feeds, sources, profiles and settings are untouched, and each feed's and source's last check and last error carry over.
4. Open **Settings → Sources**: the Status panel should show no Failing rows. Click **Back up now** once and check the file appears in your folder.
5. For development, `apps/server/.env` needs nothing new; `LOG_LEVEL` and `BACKUP_DIR` are optional.

## Deferred
- Off-machine backup destinations, a backup schedule or rotation, and restoring from the UI (ADR 0051).
- Notifications outside the app when something fails.
- A spend summary built on the recorded usage.
- Everything on the roadmap in the README (job-alert intake, ADR 0041; a tutor and a business-idea validator).

## Known issues
- **A backup is never marked old.** The backup row is Failing only after a failed attempt, by design.
- **whisper-server down shows the badge** even when nothing needs it, by design (ADR 0050).
- **Some server tests reach the real Anthropic API** with the test key (they log a 401), against the no-network rule. Found in 3.2 and not fixed in this release.
- Known from earlier versions: pages that need JavaScript or a login can't be read; the web bundle is about 1.5 MB; costs are estimates from a price table.

## Under the hood
- Server: `jobs/lifecycle.ts`, `logger.ts`, `logContext.ts`, `middleware/requestLog.ts`, `repositories/health.repository.ts`, `services/health.service.ts`, `status.service.ts`, `backup.service.ts`, `worker/serviceMonitor.ts`. Agent: `logging_setup.py`. Shared: `status.ts`. Web: `routes.tsx`, `SettingsLayout` and the three tabs, `PromptList`, `PromptPanel`, `ProfileManager`, `StatusPanel`, `useUnsavedChangesGuard`. New workspace package `e2e/`.
- New dependencies: `pino` (runtime) and `pino-pretty` (dev) in the server, `@playwright/test` (dev) in `e2e/`. None in the web app or the agent.
- Tests at release: 581 shared, 2027 server and 1282 web unit tests, 26 browser tests (Chromium and WebKit), 244 agent tests and 4 container tests, 10 e2e fakes tests and 4 e2e specs, with lint, typecheck and builds clean.

## Decisions
New ADRs: [0048](../decisions/0048-job-lifecycle-table.md) job lifecycle table (corrects TRD §2.2) · [0049](../decisions/0049-structured-logging.md) structured logging · [0050](../decisions/0050-health-status.md) health status · [0051](../decisions/0051-manual-database-backups.md) manual database backups · [0052](../decisions/0052-data-router-and-settings-routes.md) data router and Settings routes · [0053](../decisions/0053-e2e-smoke-test.md) end-to-end smoke test.
