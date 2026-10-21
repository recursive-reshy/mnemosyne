# Mnemosyne v0.7.1 — Technical Requirements

Companion to `docs/v0.7.1/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.7.0 code at commit `68e1756`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet. In code, the things the Status panel reports on are **health subjects**; one check of a subject is a **check**.

## 1. Changes at a glance
- **Job lifecycle** (ADR 0048): a pure `apps/server/src/jobs/lifecycle.ts` holds every job state's properties and every allowed move. `moveTo()` enforces it, sets expiry from the target state, and the repository's SQL status lists come from it. No behaviour change.
- **Structured logs** (ADR 0049): pino in the server with the job ID added from `AsyncLocalStorage`; a JSON formatter on `logging` in the agent; `X-Job-Id` from server to agent; `no-console` in the server.
- **Settings in tabs** (ADR 0052): a data router (`createBrowserRouter`); `/settings/prompts[/:promptId]`, `/settings/models`, `/settings/sources`; a Prompts tab with a list and an editor side by side; one unsaved-changes guard using `useBlocker`.
- **Status panel** (ADR 0050): migration 8 adds `health_status` and `health_errors`, moves the feed and Gmail-source `last_checked_at` / `last_error` into them, and drops those columns; one `recordCheck()`; a service monitor for the agent and whisper-server; `GET /api/status`, `POST /api/status/refresh`, `GET /api/status/:kind/:id/errors`; a Status panel and a drawer badge.
- **Backups** (ADR 0051): `POST /api/backups` with better-sqlite3's online `backup()`, written to a bind-mounted host folder; a refusal to start on a database newer than the code; `docs/backups.md`.
- **End-to-end smoke test** (ADR 0053): a new `e2e/` workspace package with Playwright, a fakes container and a Compose override; `pnpm e2e`.
- **Dependency refresh** (§9).
- **New dependencies** (and only these):
  - server: `pino` (runtime), `pino-pretty` (dev).
  - e2e (new package): `@playwright/test` (dev).
  - agent and web: none.
  - Check each package's real API against this TRD before using it; if it differs in a way that changes the design, stop and ask.
- **Environment:** `LOG_LEVEL` (server and agent, default `info`), `BACKUP_HOST_PATH` (Compose, required), `BACKUP_DIR` (server, default `/backups` in Docker), `STATUS_CHECK_INTERVAL_MINUTES` (server, default 2).

## 2. Job lifecycle (ADR 0048)

### 2.1 Today
Status changes already pass through `moveTo()` in `services/jobs.service.ts`, and `nextStep` holds the acquisition steps. The rest is spread out: each `completeX`/`failX` checks `job.status` by hand; `expires_at` is set at about ten call sites; `jobStore.repository.ts` hard-codes four status lists (`findNextRunnableJob`, `listActiveJobs`, `findExpiredJobs`, `markInterruptedJobs`); `markInterruptedJobs` and `markInterruptedLinkingJobs` bypass `moveTo()`.

### 2.2 `apps/server/src/jobs/lifecycle.ts` (new, pure, no imports from services or repositories)
```ts
type StateInfo = {
  runnable: boolean     // the worker picks it up
  active: boolean       // listed by listActiveJobs
  expires: boolean      // entering it starts the 24-hour clock; leaving clears it
  terminal: boolean
  editable: boolean     // a same-state move (draft, folder, properties) is allowed
  onRestart: JobStatus | null  // where an interrupted job goes at startup
}
export const STATES: Record< JobStatus, StateInfo >
export const MOVES: ReadonlyArray< { from: JobStatus, to: JobStatus, sources?: SourceType[] } >
export const canMove( from, to, source ): boolean
export const assertMove( job: { status, source_type }, to ): void   // throws the existing conflict error
export const statusesWhere( key: keyof StateInfo ): JobStatus[]
export const LINK_STATES / LINK_MOVES / assertLinkMove( from, to )
```
Expected table (from reading the 0.7.0 code; task 2.1's characterization test is the authority, and any difference from this table is a stop-and-ask):

| State | runnable | active | expires | terminal | editable | onRestart |
| --- | --- | --- | --- | --- | --- | --- |
| queued | ✓ | ✓ | | | | — |
| downloading, converting, transcribing, fetching | | ✓ | | | | failed |
| summarizing | ✓ | ✓ | | | | — (re-picked) |
| linking | ✓ | ✓ | | | | ready_for_review (link failed) |
| ready_for_review | | ✓ | ✓ | | ✓ | — |
| summary_failed | | ✓ | ✓ | | ✓ | — |
| saved | | | | ✓ | | — |
| failed | | | | ✓ | | — |

Moves: video `queued → downloading → converting → transcribing → summarizing`; article `queued → fetching → summarizing`; `summarizing → linking | ready_for_review | summary_failed`; `linking → ready_for_review`; `summary_failed → summarizing` (retry); `ready_for_review → summarizing` (regenerate), `→ linking` (run linking), `→ saved`; `failed → summarizing` (article, pasted text); every non-terminal state `→ failed`. Whether `summary_failed → saved` exists is settled by the characterization test.

Link states: `off | pending | linked | failed`, with the moves the 0.7.0 code makes (also pinned by the characterization test).

### 2.3 Changes
- `moveTo( job, to, changes )` calls `assertMove()`; same-state moves need `editable`. It sets `expires_at` itself: `expiryFromNow()` when the target `expires` and the job is entering it, `null` when it doesn't, unchanged on an editable same-state move unless the caller passes the autosave reset. Callers stop passing `expires_at` except that reset.
- The hand-written status checks in `completeAcquisition`, `completeSummary`, `completeLinking`, `failLinking`, `failSummary`, `retrySummary`, `regenerateSummary`, `runLinking`, `submitPastedText`, `failJob` and the save path are replaced by `assertMove()`. Their conflict messages stay the same (tests pin them).
- `nextStep` is deleted; `markStatus` uses `canMove()`.
- `jobStore.repository.ts` builds its `IN ( … )` lists from `statusesWhere()` (bound parameters, not string concatenation). `markInterruptedJobs` uses the states whose `onRestart` is `failed`; `markInterruptedLinkingJobs` the states whose `onRestart` is `ready_for_review`.
- A refused move logs at `error` with `job_id`, `from` and `to` (once §3 lands; until then it only throws).

### 2.4 Tests
- Task 2.1 writes `jobs/lifecycle.characterization.test.ts` first, **against the 0.7.0 services**: it drives each service function from each status and records which succeed. It stays in the suite and must pass unchanged after the refactor.
- `lifecycle.test.ts`: every pair in `MOVES` allowed, every other pair refused, per source; `statusesWhere` matches the table.
- ADR 0048 holds the final table and two Mermaid state diagrams (job, link state).

## 3. Structured logs (ADR 0049)

### 3.1 Server
- `apps/server/src/logger.ts` (new): `pino` with `level: config.logLevel`, `timestamp: pino.stdTimeFunctions.isoTime`, `formatters.level` returning `{ level: label }`, `base: { service: 'server' }`, a `mixin()` that returns the current log context, and `redact: { paths: [ '*.authorization', '*.token', '*.refresh_token', '*.access_token', '*.apiKey', '*.api_key', '*.secret' ], censor: '[redacted]' }`.
- `apps/server/src/logContext.ts` (new): `AsyncLocalStorage< { job_id?: string, feed_id?: string, gmail_source_id?: string } >` with `withLogContext( context, fn )`.
- The worker wraps each job's run in `withLogContext( { job_id } )`; the feed poller wraps each feed's check in `{ feed_id }`; the Gmail poller each source in `{ gmail_source_id }`.
- Every `console.*` call in `apps/server/src` (26 today) becomes a `logger` call with a message and structured fields. Errors are passed as `{ err }` so pino serializes the stack. `config.ts` keeps `console.error` (it runs before the logger exists) with an `eslint-disable-next-line` and a reason.
- Request logging: a hand-written middleware (`middleware/requestLog.ts`, new) logs `method`, `route` (the matched route pattern, falling back to the path), `status` and `duration_ms` on `finish`; `info` below 500, `error` from 500. `/api/health` and `/api/status` are skipped.
- `apps/server/eslint.config.js`: `no-console: error`.
- Never logged: request or response bodies, note or transcript text, prompts, email content, tokens. A test on `logger.ts` checks the redaction paths; a test writes a log line with a nested `refresh_token` and asserts it is censored.
- `pnpm --filter server dev` pipes through `pino-pretty`; Docker logs stay JSON.

### 3.2 Agent
- `logging_setup.py` (new): a `JsonFormatter` (`time` ISO 8601, `level` lowercase, `service: "agent"`, `msg`, plus `job_id` and any `extra` fields; exceptions as `err`), a `contextvars.ContextVar[ str | None ]` `job_id_var`, and a filter that copies it onto each record. `configure_logging( level )` is called where `main.py` builds the module-level `app`, replacing the current `StreamHandler` / `Formatter` lines, and also configures the `uvicorn` and `uvicorn.access` loggers to use it.
- A middleware in `create_app` reads `X-Job-Id` (if it is a UUID) into `job_id_var` for the request and resets it after.
- `LOG_LEVEL` is read in `config.py` (default `info`, invalid values are a `ConfigError`).
- The existing per-request log line keeps its fields (outcome, tool calls, tokens) and still never logs content; a test asserts a link run's captured log output contains none of the note's body.

### 3.3 Server → agent
`clients/agent.client.ts` sends `X-Job-Id` on `requestLinks` when called inside a job context. The contract (ADR 0043) doesn't change.

## 4. Settings tabs and the Prompts layout (ADR 0052)

### 4.1 Data router
- `main.tsx` uses `createBrowserRouter( routes )` and `<RouterProvider>`. `routes.tsx` (new) exports the route objects so tests build them with `createMemoryRouter( routes, { initialEntries } )`.
- `App.tsx` becomes the layout route (app shell with `<Outlet>`). Paths are unchanged: `/`, `/jobs/:id`, `/settings/*`, `*` → `/`.
- Existing tests that render `<App>` inside `<MemoryRouter>` move to the memory data router through a `renderWithRouter( path )` helper in `test-support/`. This is the only allowed change to existing tests in checkpoint C, and each changed file is listed in the log.

### 4.2 Routes
```
/settings                 SettingsLayout (heading, Tabs, Outlet)
  index                   → Navigate to prompts (replace)
  prompts                 PromptsTab (list only below md; list + "Select a prompt" above md, opens the default profile)
  prompts/:promptId       PromptsTab (list + PromptPanel; below md, PromptPanel with a back button)
  models                  ModelsTab
  sources                 SourcesTab
  *                       → Navigate to prompts (replace)
```
- `:promptId` is a summary profile's id or the literal `linker`. An unknown or deleted id redirects to `prompts`.
- MUI `Tabs` with `value` from the matched child and each `Tab` rendered as a react-router `Link` (`component={ Link }`). MUI gives the `tablist` / `tab` roles.
- The drawer's Settings item is current for any `/settings/*` path.

### 4.3 Unsaved-changes guard
- `hooks/useUnsavedChangesGuard.ts` (new) replaces `useUnsavedChangesWarning`: the same `beforeunload` effect, plus `useBlocker( isDirty )` with a `ConfirmDialog` ("Discard unsaved changes?"; Discard proceeds, Keep editing resets). It returns the dialog element for the caller to render.
- Used by `PromptPanel` (summary and linker) and by `useAutosaveDraft` (which keeps its current behaviour; the blocker only adds an in-app guard while a save is pending or failed).
- A same-path navigation (selecting the already selected prompt) is not blocked.

### 4.4 Components
- `SettingsPage` is replaced by `SettingsLayout`, `PromptsTab`, `ModelsTab`, `SourcesTab` (new, each in its own folder with tests).
- `PromptProfiles` splits into `PromptList` (MUI `List` with subheaders **Summary profiles** and **Linking**, `ListItemButton`s as links, default marked with a chip; New, Rename, Delete and Set as default as now) and `PromptPanel` (reads `:promptId`; `PromptEditor`, `PromptHistory`, reset, and `LockedInstructions` below: video and article for a summary profile, the linker's for `linker`). The dropdown and its selection state are removed.
- `LinkerPrompt` is removed; its editor wiring moves into `PromptPanel` for `linker`.
- `ModelsTab` holds `SummarizerDefaults` and `LinkingSettings` minus its agent-status block (moved to the Status panel) and minus the linker prompt.
- `SourcesTab` holds `StatusPanel` (§5.6), `FeedSettings`, `GmailSettings`.
- Widths: Prompts uses the full content width; Models and Sources keep `maxWidth: '40rem'`. The list is 280px at `md` and up.
- `apps/web/CLAUDE.md` names the new components and the router.

## 5. Status panel (ADR 0050)

### 5.1 Shared (`packages/shared/src/status.ts`, new)
```ts
HealthKind = z.enum( [ 'feed', 'gmail_source', 'gmail_connection', 'agent', 'whisper', 'backup' ] )
HealthState = z.enum( [ 'ok', 'failing', 'off' ] )
StatusRow = { kind, id, name, state, last_checked_at, last_success_at, last_error, failing_since, detail }  // detail: e.g. backup size and file name, nullable
GetStatusResponse = { rows: StatusRow[], failing_count: number }
HealthError = { at, message }
GetHealthErrorsResponse = { errors: HealthError[] }
BackupResult = { file, bytes, at }
```
Singleton subjects (`gmail_connection`, `agent`, `whisper`, `backup`) use the id `default`.

### 5.2 Migration 8 (a function migration, `addHealth`)
```sql
CREATE TABLE health_status (
  kind TEXT NOT NULL, subject_id TEXT NOT NULL,
  last_checked_at TEXT, last_success_at TEXT, last_error TEXT, failing_since TEXT, detail TEXT,
  PRIMARY KEY ( kind, subject_id )
);
CREATE TABLE health_errors (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, subject_id TEXT NOT NULL, at TEXT NOT NULL, message TEXT NOT NULL
);
CREATE INDEX health_errors_subject ON health_errors ( kind, subject_id, at );
```
Then, for `feeds` and `gmail_sources`: insert a `health_status` row per row with its `last_checked_at` and `last_error` (`last_success_at` = `last_checked_at` when `last_error` is null, else null; `failing_since` = `last_checked_at` when `last_error` is set), and one `health_errors` row when `last_error` is set; then `ALTER TABLE … DROP COLUMN last_checked_at` and `DROP COLUMN last_error`. Tested from version 7 with data and from empty.

### 5.3 Repositories
- `health.repository.ts` (new): `recordSuccess( kind, id, at, detail? )`, `recordFailure( kind, id, at, message )` (sets `failing_since` only if not already failing; inserts the error and deletes all but the newest 5 for that subject, in one transaction), `getHealth( kind, id )`, `listHealth()`, `listErrors( kind, id )`, `deleteHealth( kind, id )`.
- `feeds.repository.ts` and `gmailSources.repository.ts` read `last_checked_at` and `last_error` through a `LEFT JOIN health_status`, so `Feed` and `GmailSource` keep their fields. The "due" queries (`last_checked_at IS NULL OR last_checked_at <= ?`) use the joined column. Their update statements stop writing those columns. Deleting a feed or source (soft delete) calls `deleteHealth`.

### 5.4 Server
- `services/health.service.ts` (new): `recordCheck( subject, result )` where `result` is `{ ok: true, detail? } | { ok: false, message }`; it stamps `now`, calls the repository and logs failures at `warn` with the subject.
- Callers: the feed check (`services/feeds.service.ts`), the Gmail source check, the Gmail token refresh in `gmail/auth.ts` (`gmail_connection`), the service monitor, the backup.
- `worker/serviceMonitor.ts` (new): every `STATUS_CHECK_INTERVAL_MINUTES` (default 2) and on demand, checks:
  - **agent:** `checkHealth()` from `clients/agent.client.ts` without its 30 s cache (a `fresh` option). Skipped (row `off`) when `config.agent` is null or linking is off.
  - **whisper:** `GET <WHISPER_URL>/health` with a 3 s timeout, in `clients/whisperServer.client.ts` (`checkWhisperHealth`, new). If the installed whisper.cpp server answers 404 on `/health`, a 404 counts as reachable (the server answered); task 5.4 checks the real build and records which applies in its log line. Never `off`.
  - Started and stopped with the other workers in `server.ts` / `shutdown.ts`.
- `services/status.service.ts` (new): builds `GetStatusResponse` from `listHealth()` joined with the live feeds, Gmail sources, Gmail account and settings: `off` for a disabled feed or source, Gmail `not_configured`/`not_connected`, agent not configured or linking off; `failing` when `last_error` is set (and for Gmail `reconnect_needed`, with its error); `ok` otherwise once checked; a never-checked enabled subject is `ok` with null times. Names come from the feed/source rows; singletons have fixed names ("Gmail connection", "Agent service", "whisper-server", "Backups"). Order: services, backup, Gmail connection, Gmail sources, feeds; each group by name.
- Routes (`routes/status.routes.ts`, new): `GET /api/status`; `POST /api/status/refresh` (runs the service monitor once, then returns `GET`'s body); `GET /api/status/:kind/:id/errors` (400 for an unknown kind, 404 for an unknown subject).
- `GET /api/settings` keeps `agent_status` (the Models tab no longer shows it, but the review screen's linking notice reads it).

### 5.5 Web: hooks
- `api/status.api.ts`, `statusKeys`, `useStatus()` (`refetchInterval: 60_000`, `refetchOnWindowFocus: true`), `useRefreshStatus()` (sets the `useStatus` cache from the response), `useHealthErrors( kind, id, enabled )`.

### 5.6 Web: components
- `StatusPanel` (new): an MUI `Table` (stacked rows below `sm`) with Name and kind, Last checked, Last success ("never"), and a status cell with an icon and text (OK / Failing / Off) so state is never colour alone. A failing row has an expand button that loads `useHealthErrors` and lists the last 5 errors with times. The Gmail connection row, when `reconnect_needed`, has **Reconnect** (the existing connect action). The backup row has **Back up now** (§6.4). Calls `useRefreshStatus` once on mount.
- `NavDrawer`: the Settings item's icon is wrapped in an MUI `Badge` (warning colour, `badgeContent` = `failing_count`, invisible at 0); the item's accessible name becomes "Settings, N failing" when N > 0. Works collapsed and expanded.
- `FeedList` and `GmailSourceList` are unchanged (their fields still arrive).

## 6. Backups (ADR 0051)

### 6.1 Config and Docker
- `config.ts`: `BACKUP_DIR` (default `join( tmpdir(), 'mnemosyne-backups' )` outside Docker, like `DATA_DIR`).
- `docker-compose.yml`, `mnemosyne` service: `- ${BACKUP_HOST_PATH:?Set BACKUP_HOST_PATH in .env to your backups folder}:/backups` and `BACKUP_DIR: /backups`. Not mounted into `agent`.
- `.env.example`: `BACKUP_HOST_PATH=` under Required, with the comment "Absolute path of the folder backups are written to on this Mac, e.g. /Users/<you>/mnemosyne-backups". `apps/server/.env.example`: `BACKUP_DIR`.

### 6.2 `services/backup.service.ts` (new)
- `runBackup()`: single-flight (a module-level promise; a second call while one runs throws a conflict error, 409). Steps:
  1. `mkdir -p` the folder.
  2. `name = mnemosyne-YYYYMMDD-HHmmss.db` in `Asia/Singapore` (`Intl.DateTimeFormat` parts, not the container's TZ).
  3. `await getDatabase().backup( join( dir, name + '.partial' ) )`.
  4. Open the partial file read-only with better-sqlite3, run `PRAGMA quick_check`; anything but `ok` deletes the partial and fails.
  5. `rename` to the final name; `stat` for the size.
  6. `recordCheck( { kind: 'backup', id: 'default' }, { ok: true, detail: JSON.stringify( { file, bytes } ) } )`; on any failure, delete the partial if present and `recordCheck( …, { ok: false, message } )`.
- Never deletes a finished backup.
- `POST /api/backups` (`routes/backups.routes.ts`, new) → 201 `BackupResult`; 409 while one runs; 500 with the message on failure.

### 6.3 Restore guard
`openDatabase` (in `repositories/database.ts`): before `runMigrations`, if `user_version > migrations.length`, close and throw "This database is from a newer version of Mnemosyne (schema N, this version knows M). Restore an older backup or upgrade the app." `server.ts` prints it and exits 1. Tested with a database whose `user_version` is set past the list.

### 6.4 Web
`useRunBackup()` mutation; on success it invalidates `useStatus`. The backup row's **Back up now** is disabled while pending, shows a `CircularProgress`, and on success shows "Backed up to <file> (<size>)" in a `role="status"` line; on error an `Alert`.

### 6.5 `docs/backups.md` (new)
What is backed up (the database: jobs, drafts, prompts, settings, feeds, sources, inbox, usage, the encrypted Gmail token) and what isn't (the vault, `.env`). Restore steps:
```bash
docker compose down
docker run --rm -v mnemosyne_mnemosyne-data:/data -v "$BACKUP_HOST_PATH":/backups alpine \
  sh -c 'rm -f /data/<db>-wal /data/<db>-shm && cp /backups/<backup>.db /data/<db>'
docker compose up -d
```
(with the real volume and database file names filled in by the task). Older backups migrate forward on start; newer ones are refused (§6.3). If `TOKEN_ENCRYPTION_KEY` is lost or changed, the Gmail connection shows as failing; reconnect it, everything else is intact. Keep `.env` in a password manager. Linked from the README.

## 7. End-to-end smoke test (ADR 0053)

### 7.1 Package
`e2e/` (new workspace member; add `e2e` to `pnpm-workspace.yaml`): `package.json` (`@mnemosyne/e2e`, private; scripts `test` → nothing (exits 0, so `pnpm -r test` stays fast), `lint`, `typecheck`, `e2e` → `./run.sh`), `playwright.config.ts` (`baseURL: http://localhost:3101`, Chromium only, one worker, `retries: 0`, traces on failure), `tests/`, `fakes/`, `docker-compose.e2e.yml`, `run.sh`. Root `package.json`: `"e2e": "pnpm --filter @mnemosyne/e2e e2e"`.

### 7.2 Fakes (`e2e/fakes/server.mjs`, Node built-ins only, its own small Dockerfile on `node:24-slim`)
- `GET /article` → a fixture article HTML; `GET /feed.xml` → an RSS feed of 2 items linking to `/article` and `/article-2`.
- `GET /health` → 200 (stands in for whisper-server).
- `GET /v1/models` → a fixture list (one Sonnet, one Haiku).
- `POST /v1/messages`: if the request has `tools`, return a `tool_use` of the agent's submit tool with two suggestions whose anchors appear in the fixture summary; otherwise return a summary matching the server's article `SummaryResult` structured output. Responses are fixture JSON files, with `usage` set. Anything unexpected → 400 with a message, so a contract change fails loudly.
- Task 8.1 checks that neither Anthropic client passes `baseURL` / `base_url` explicitly (so `ANTHROPIC_BASE_URL` applies); if one does, stop and ask.

### 7.3 Compose override (`e2e/docker-compose.e2e.yml`)
Adds `fakes`; on `mnemosyne` and `agent` sets `ANTHROPIC_BASE_URL: http://fakes:4000` and `ANTHROPIC_API_KEY: e2e`; on `mnemosyne` sets `WHISPER_URL: http://fakes:4000` and `ports: !override [ "3101:3100" ]`. No poll interval is changed: the feed test uses the existing check action (`POST /api/feeds/:id/check`, through the UI's check button if it has one, else through the API). `run.sh` exports `VAULT_HOST_PATH` and `BACKUP_HOST_PATH` as fresh `mktemp -d` folders and a random `AGENT_SECRET`, runs `docker compose -p mnemosyne-e2e -f docker-compose.yml -f e2e/docker-compose.e2e.yml up -d --build --wait`, then `playwright test`, and in a `trap` always runs `down -v` and removes the temp folders. It passes the temp paths to Playwright through env so tests can assert files.

### 7.4 Tests
- `article.spec.ts`: submit `http://fakes:4000/article`; wait for the review screen; on Suggested links, accept the first suggestion; save to the default folder; assert the note exists under the temp vault and contains `[[`.
- `feed.spec.ts`: add the feed `http://fakes:4000/feed.xml` in Settings → Sources; check it now; see its 2 items in the inbox on the home page.
- `status.spec.ts`: Settings → Sources shows no Failing rows and no drawer badge; **Back up now** shows the result line and a `.db` file exists in the temp backups folder.

### 7.5 When it runs
Not in `pnpm -r test`. The root `CLAUDE.md` "Before you stop" gains: run `pnpm e2e` at the end of every checkpoint from F on, and include its result in the report. Needs Docker running on the Mac.

## 8. Docker and environment
- `docker-compose.yml`: the backups mount (§6.1); `LOG_LEVEL: ${LOG_LEVEL:-info}` on both services.
- `.env.example`: `BACKUP_HOST_PATH` (required), `LOG_LEVEL` (optional).
- `apps/server/.env.example`: `BACKUP_DIR`, `LOG_LEVEL`, `STATUS_CHECK_INTERVAL_MINUTES`.
- Naresh's real `.env` needs `BACKUP_HOST_PATH` before `docker compose up` (release notes).

## 9. Dependency refresh
- First task of the checkpoint: run `pnpm -r outdated` and `uv tree --outdated` (in `apps/agent`) and write the result into the checkpoint plan as a table (package, app, current, latest, minor or major). No changes in that task.
- Minor and patch upgrades: one task per app, together.
- Each major upgrade: its own task and commit. Stop and ask if it needs more than about 30 lines of code changes, or touches the MDXEditor round-trip (ADR 0023); the decision becomes an ADR.
- Held unless Naresh decides otherwise: TypeScript 6 (ADR 0010; if typescript-eslint now supports 7, stop and ask), Python 3.14. Exact-pinned packages (`@googleapis/gmail`, `@mozilla/readability`, `feedsmith`, `linkedom`, `turndown`) move to newer exact versions.
- Base images: `node:24-slim` and `python:3.14-slim` at their current patch; `uv` pin in the agent Dockerfile to the current release. Record image sizes before and after in the log line.
- Every task: tests, lint, typecheck, `test:browser`, and `pnpm e2e` green.

## 10. Tests

### 10.1 Rules
- As before: TDD; no test touches the network, the Claude API or a real vault (the e2e stack uses local fakes and temp folders).
- Existing tests pass unchanged, except: checkpoint A, conflict tests whose setup relied on writing statuses the lifecycle now refuses (list each); checkpoint B, tests that spied on `console.*` (now spy on the logger); checkpoint C, the router helper change (§4.1) and `SettingsPage` tests moving to the new tab components; checkpoint D, repository tests whose fixtures wrote `last_checked_at` / `last_error` directly. Each changed file is named in the log line.

### 10.2 What must be covered
- The lifecycle characterization test (§2.4) green before and after the refactor.
- Migration 8 from version 7 with feeds and sources (values carried over, columns gone) and from empty.
- `recordFailure` keeps 5 errors and keeps `failing_since` on repeated failures; success clears `last_error` and `failing_since`.
- Backup: a real backup of a temp database passes `quick_check`; a second concurrent call gets 409; a failed `quick_check` leaves no file; the restore guard.
- Router: tab routes, redirects, the guard blocking a tab switch and a prompt switch with unsaved edits.

## 11. Phases and checkpoints
| Checkpoint | Phases |
| --- | --- |
| A | 1 Kick-off, 2 Job lifecycle |
| B | 3 Structured logs |
| C | 4 Data router and Settings tabs |
| D | 5 Health data and server, 6 Status panel |
| E | 7 Backups |
| F | 8 End-to-end smoke test |
| G | 9 Dependency refresh |
| H | 10 Clean-up and release |
