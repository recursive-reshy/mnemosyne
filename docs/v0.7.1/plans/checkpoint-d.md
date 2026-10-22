# Checkpoint D plan: Phases 5–6 (health data, server and Status panel)

Next: checkpoint D, task 5.1. ADR 0050; TRD §5, §10.1, §10.2. Touches `packages/shared`, `apps/server`, `apps/web`. Not the agent. Each task's gate: tests, lint and typecheck for every folder it touched (web also `test:browser`). Existing tests change only as TRD §10.1 allows (repository fixtures that wrote `last_checked_at` / `last_error` directly); each changed file is named in the log line. No job behaviour changes.

## Findings that shape the plan
- `feeds.repository.ts` already exports `recordCheck( id, FeedCheck )`; `gmailSources.repository.ts` exports `recordSourceCheck`. The new `health.service.recordCheck` is a different module and name-space; the repository functions are removed (their only writes of the dropped columns), so no clash remains.
- `StoredFeed` / `StoredGmailSource` Zod schemas, `insertFeed` / `updateFeed` and their fixtures (`test-support/gmailSources.fixture.ts`, web fixtures) carry `last_checked_at` / `last_error`. They keep those fields on **read** (via the join) but stop writing them. `insertFeed` / `updateFeed` named parameters drop them, so callers and fixtures that set them directly must go through `recordSuccess` / `recordFailure` (the §10.1 allowance).
- Feed/source check data is written in four places: `feeds.service` (`addFeed` at creation sets `last_checked_at: now`, `checkFeed` success and failure), `gmailSources.service` (create sets null, `recordSourceCheck` inside the check transaction with a failure string or a "Label not found" error). Each becomes a `health.service.recordCheck` call. `last_skipped_count`, `etag`, `last_modified` stay on the row, so the feed/source "check" repository functions are kept for those fields only.
- Gmail connection: failures are recorded where `setAccountStatus( 'reconnect_needed', … )` is called (`gmail/auth.ts` lines ~162 and ~223); success when a Gmail call works and on connect. The Gmail connection row's `failing` state is also forced from `gmail_account.status = reconnect_needed` at read time (TRD §5.4), so a missed write can't hide it.
- Real whisper-server (checked now): `GET http://localhost:8178/health` → `200 OK`, `Server: whisper.cpp`, 15-byte JSON body. So `checkWhisperHealth` treats a 2xx as reachable; the 404 fallback in TRD §5.4 is **not needed**. Recorded in 5.4's log line. In Docker the URL is `http://host.docker.internal:8178`.
- `requestLog` already skips `/api/status` (3.3); no change.
- `NavDrawer` already has a Settings dot badge for `account.status === 'reconnect_needed'` (`warning` prop on `NavItem`). 6.3 replaces it with the count badge from `useStatus`; Gmail reconnect becomes one failing row, so it is still counted. Its tests change (allowed: it is the same behaviour moved to the new source); listed in the log.
- `GET /api/settings` keeps `agent_status` (review screen's `LinkingNotice` reads it via `useSettings`). Only the Models-tab block in `LinkingSettings` is removed (6.2, as tasks.md says; it stayed in 4.3).

## 5.1 Shared `status.ts`
Tests first (`packages/shared/src/status.test.ts`): `HealthKind` accepts the six kinds and rejects others; `StatusRow` round-trips with nullable times/error/detail; `GetStatusResponse` needs `failing_count`; `HealthError`, `GetHealthErrorsResponse`, `BackupResult` parse valid / reject invalid. Red: module missing.
Code: `packages/shared/src/status.ts` as TRD §5.1; export from `index.ts`. Run `shared` tests, lint, typecheck.

## 5.2 Migration 8 `addHealth`
Tests first (`repositories/database.test.ts`, new cases): from a version-7 database with feeds and Gmail sources (failing one, OK one, never-checked one): `health_status` rows carry `last_checked_at`, `last_success_at` (= checked when no error, else null), `last_error`, `failing_since` (= checked when error); one `health_errors` row for each failing; both columns gone from `feeds` and `gmail_sources`; `user_version` = 8. From an empty database: tables and index exist, no rows. Red: migration list has 7 entries.
Code: `addHealth( db )` function appended to `migrations` in `database.ts` (CREATE TABLEs, INSERT … SELECT for each table with `kind` `feed` / `gmail_source`, `ALTER TABLE … DROP COLUMN`; soft-deleted rows are skipped since 5.3 removes health on delete). No existing migration test pins the count other than via `migrations.length`; check on the run.

## 5.3 `health.repository.ts` and the join
Tests first:
- `health.repository.test.ts`: `recordSuccess` sets checked/success, clears error and `failing_since`; `recordFailure` sets `failing_since` once (a second failure keeps the first), appends an error and keeps only the newest 5 in one transaction; `getHealth`, `listHealth`, `listErrors` (newest first), `deleteHealth` (status and errors). Covers TRD §10.2 bullets 3.
- `feeds.repository.test.ts` / `gmailSources.repository.test.ts`: reads show `last_checked_at` / `last_error` from `health_status` (null when none); `listDueFeeds` / `listDueSources` use the joined column (never-checked first, then oldest, interval respected); `markFeedDeleted` / `markSourceDeleted` remove the health rows; insert/update no longer write the columns.
Code: `health.repository.ts`; `feeds.repository.ts` and `gmailSources.repository.ts` use `LEFT JOIN health_status h ON h.kind = 'feed' AND h.subject_id = feeds.id` and select `h.last_checked_at, h.last_error`; `insertFeed` / `updateFeed` / `insertSource` / `updateSource` parameters drop those two; `recordCheck` / `recordSourceCheck` shrink to `etag, last_modified, last_skipped_count` (renamed `recordFeedFetch` / `recordSourceFetch` only if the old name would mislead; otherwise keep). Services keep compiling because `StoredFeed` still has the fields on read; writes move in 5.4.
Existing tests changed: repository tests and fixtures that set the two fields on insert (listed in the log).

## 5.4 `recordCheck`, service checks, service monitor
Tests first:
- `health.service.test.ts`: `recordCheck( { kind, id }, { ok: true, detail } )` calls `recordSuccess` with `now`; `{ ok: false, message }` calls `recordFailure` and logs a `warn` with the subject (no message beyond what is already logged elsewhere).
- `feeds.service.test.ts`: `addFeed` records success; `checkFeed` success → success row, failure → failure row with the error message and the returned `Feed` still shows `last_error`. `gmailSources.check` tests: success, error, and the missing-label message → failure. `gmail/auth.test.ts`: revoked/unreadable token records a `gmail_connection` failure; a good call records success.
- `whisperServer.client.test.ts`: `checkWhisperHealth( url )` is `true` on 200, `false` on 5xx, on a refused connection, and on a timeout (3 s, fake timers).
- `agent.client.test.ts`: `checkHealth( { fresh: true } )` bypasses the 30 s cache; the default path unchanged.
- `worker/serviceMonitor.test.ts`: one tick records agent and whisper; agent skipped (no row written, treated `off` at read) when `config.agent` is null or linking is off; the interval comes from `STATUS_CHECK_INTERVAL_MINUTES`; the returned stop function clears the timer; a throwing check doesn't kill the loop.
- `config.test.ts`: `statusCheckIntervalMinutes` default 2, env override, invalid rejected like the other interval settings.
Code: `services/health.service.ts` (`recordCheck`, `checkWhisperHealth` call site, `checkHealth( { fresh } )` wrapper `runServiceChecks()` used by monitor and refresh); `clients/whisperServer.client.ts#checkWhisperHealth`; `agent.client.ts` gets the `fresh` option; `worker/serviceMonitor.ts` (`startServiceMonitor()` returns stop; also runs once at startup); wire it into `server.ts` and `shutdown.ts` (`stopServiceMonitor` option) like the sweeper; `config.statusCheckIntervalMinutes`; `STATUS_CHECK_INTERVAL_MINUTES` in `docker-compose.yml` (optional, default 2), both `.env.example` files. Callers: `feeds.service.ts`, `gmailSources.service.ts` (inside the existing check transaction), `gmail/auth.ts`.
Existing tests changed: service tests that asserted `recordCheck` repository arguments (listed in the log). The log line records the real whisper answer: 200 on `/health`.

## 5.5 `status.service.ts` and routes
Tests first:
- `status.service.test.ts`: state rules from TRD §5.4 — disabled feed/source `off`; Gmail `not_configured` / `not_connected` `off`; Gmail `reconnect_needed` `failing` with the account error even with no health row; agent `off` when not configured or linking off; whisper never `off`; failing when `last_error` set; never-checked enabled subject `ok` with null times; backup row always present (never → `ok`, "never", `detail` null); names (fixed for singletons, feed/source names otherwise); order services → backup → Gmail connection → Gmail sources → feeds, each group by name; `failing_count`; `detail` passes through.
- `status.routes.test.ts`: `GET /api/status` body parses as `GetStatusResponse`; `POST /api/status/refresh` runs the service checks once (mock) and returns the same body; `GET /api/status/:kind/:id/errors` returns up to 5 newest-first; unknown kind 400; unknown subject 404 (feed id not live, singleton id other than `default`).
Code: `services/status.service.ts`, `routes/status.routes.ts`, `app.ts` mount (before `notFoundHandler`). Decision recorded: the backup row's `detail` is the stored JSON; the service parses it and returns the file/size as a readable string (web shows it as is). Typecheck confirms the response against the shared schema.

Server checks after 5.5: `pnpm --filter server test`, lint, typecheck, build.

## 6.1 Web API and hooks
Tests first: `api/status.api.test.ts` (get, refresh, errors request URLs and parsed bodies, error mapping like the other api files); `useStatus.test.ts` (polls every 60 s with fake timers, refetches on focus); `useRefreshStatus.test.ts` (POST, sets the `useStatus` cache from the response); `useHealthErrors.test.ts` (does nothing while `enabled` is false). Red: modules missing.
Code: `api/status.api.ts`, `statusKeys` in `hooks/queryKeys.ts`, `hooks/useStatus.ts`, `useRefreshStatus.ts`, `useHealthErrors.ts`.

## 6.2 `StatusPanel` in `SourcesTab`
Tests first (`StatusPanel.test.tsx`, plus the `SourcesTab` and `LinkingSettings` tests):
- Rows render name + kind, last checked, last success ("never" when null), and a status cell with an icon **and** text (OK / Failing / Off); the latest error shows on a failing row.
- A failing row has an expand button (accessible name, `aria-expanded`); opening it loads errors and lists up to 5 with times; closed rows don't fetch.
- Gmail connection row: `reconnect_needed` shows the plain message and **Reconnect**, calling the same connect action `GmailSettings` uses; other rows have none.
- Calls `useRefreshStatus` once on mount; loading and error states; stacked layout below `sm` (`mockMatchMedia`).
- The backup row's **Back up now** is not rendered yet (7.4).
- `SourcesTab` renders the panel above the feed and Gmail sections; `LinkingSettings` no longer shows the agent-status text (those assertions are deleted with the block: allowed, TRD §4/§5.6).
Code: `components/StatusPanel/` (panel, row, `StateCell`, `ErrorHistory`), `checkedAt.ts` helpers reused for relative times, `SourcesTab` update, `LinkingSettings` block removed. Browser test only if layout needs it (stacked rows at 500px).

## 6.3 `NavDrawer` badge
Tests first (`NavDrawer.test.tsx`): with `failing_count` 3 the Settings link's accessible name is "Settings, 3 failing" (singular/plural handled: "1 failing"), collapsed and expanded; badge shows the number and is not colour alone; 0 → no badge, name "Settings"; status still loading or errored → no badge. The old Gmail-reconnect dot cases are replaced by the count cases (the reconnect case now flows through the status response).
Code: `NavItem` takes `badgeCount` instead of `warning`/dot; `NavDrawer` reads `useStatus()`; remove `useGmailAccount` from it if nothing else uses it there.

Web checks after 6.3: unit tests, `test:browser`, lint, typecheck, build.

## Order and commits
5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 6.1 → 6.2 → 6.3; one commit each (`feat(5.1): …`) with the `tasks.md` tick and log line, staged by name, pushed.

## End of checkpoint
Report: tasks with commit hashes; tests/lint/typecheck/build per folder (shared, server, web + `test:browser`); screenshots light and dark of Sources with the Status panel (OK, failing with errors expanded, off) and the drawer badge collapsed and expanded; ADRs: none new, no TRD change (the whisper `/health` finding removes the TRD's 404 caveat, noted for Naresh).

## Verification
Per task as above. End-to-end by hand: run the real server on a copy of the 0.7.0 database (migration 8 runs on startup), open Settings → Sources; stop whisper-server / point `AGENT_URL` at nothing and watch the rows go Failing and the badge count rise within `STATUS_CHECK_INTERVAL_MINUTES` or on **Refresh**; break a feed URL and open its error history. `pnpm e2e` doesn't exist until checkpoint F.

## Decisions
1. **Backup row `detail`**: stored as JSON (`{ file, bytes }`) by 7.2; `status.service` returns it as a display string such as "mnemosyne-….db, 1.2 MB". Until 7.2 the row is "never".
2. **Feed/source repository `recordCheck` names**: the repository functions are reduced to the non-health fields and renamed (`recordFeedFetch`, `recordSourceFetch`) so the name `recordCheck` means one thing (health) everywhere.
No ADR is needed for either; both are inside ADR 0050.
