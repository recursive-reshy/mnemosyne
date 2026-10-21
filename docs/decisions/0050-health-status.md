# 0050. Health status: one table per subject, one `recordCheck`, and a Status panel

- Status: Proposed
- Date: 2026-10-21

## Context
Feeds and Gmail sources store `last_checked_at` and `last_error` on their own rows. There is no last success and no error history, the Gmail connection keeps its own status, the agent is checked only when Settings loads, and whisper-server is never checked. Nothing outside Settings says that something is failing.

## Decision
- Two new tables: `health_status` (one row per subject: `kind`, `subject_id`, last checked, last success, last error, failing since, detail) and `health_errors` (newest 5 per subject, trimmed on insert).
- Kinds: `feed`, `gmail_source`, `gmail_connection`, `agent`, `whisper`, `backup`. Singletons use the id `default`.
- Every check reports through one `recordCheck( subject, result )`: feed and Gmail-source checks, the Gmail token refresh, a service monitor (agent and whisper-server every `STATUS_CHECK_INTERVAL_MINUTES`, default 2, and on demand), and backups.
- **One source of truth:** migration 8 moves the feed and Gmail-source `last_checked_at` / `last_error` into `health_status` and drops the columns. The feed and Gmail-source repositories read them through a join, so their API shapes don't change.
- The state shown (`ok`, `failing`, `off`) is computed when read: `off` for disabled sources, Gmail not set up, and the agent when not configured or linking is off. whisper-server is never `off`: when it is down it is failing.
- API: `GET /api/status` (rows and `failing_count`), `POST /api/status/refresh`, `GET /api/status/:kind/:id/errors`. Schemas in `packages/shared/src/status.ts`.
- Web: a Status panel at the top of Settings → Sources, and a warning badge with an accessible count on the drawer's Settings item, both from one `useStatus` query polled every 60 seconds.

## Consequences
- Anything new that can fail (a future Gmail job-alert source, the tutor's jobs) gets a Status row by calling `recordCheck`.
- The migration drops two columns from two tables and changes the feed and source repositories' queries, including the "due for a check" queries.
- whisper-server being down shows the badge even when nothing needs it; that was chosen deliberately.

## Alternatives considered
- **Keep the old columns and also write the new tables:** a smaller change, but two copies of the same fact.
- **Only in-memory status:** loses history and last success on every restart.
- **Notifications outside the app:** KIV.
