# Checkpoint B plan: Phase 3 (structured logs)

## Context
ADR 0049 / TRD §3. The server logs with 26 `console.*` calls and has no request log; the agent logs plain text. Nothing ties a link run in the agent to the job in the server. This checkpoint adds `pino` to the server, a JSON formatter to the agent, and `X-Job-Id` across the two. No job behaviour changes (PRD §4).

Order is fixed: 3.1 → 3.2 → 3.3 → 3.4. After each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server` (task 3.4 also `uv run pytest`, `ruff check` without `--fix`, and the type checker `apps/agent/CLAUDE.md` names, plus `packages/shared` only if touched); tick Status, add a log line, commit, push.

Dependencies: `pino` (runtime) and `pino-pretty` (dev) in `apps/server`, both named in TRD §1. Check their real API when adding them; if it differs in a way that changes the design, stop and ask.

## Task 3.1: logger, log context, config
**Tests first (red because the modules don't exist):**
- `apps/server/src/logger.test.ts`: writes a line through a logger built on a capturing destination and asserts: JSON with `level` as a label, ISO `time`, `service: "server"`; `{ err }` serializes `message` and `stack`; an object with a nested `refresh_token`, `access_token`, `token`, `authorization`, `apiKey`, `api_key`, `secret` comes out as `[redacted]` (one assertion per redact path in TRD §3.1); `mixin` adds the current context fields inside `withLogContext` and nothing outside it.
- `apps/server/src/logContext.test.ts`: `withLogContext` exposes the context to sync and async callees (across an `await`), nested calls merge, concurrent runs don't leak into each other, and the context is gone after the call.
- `config.test.ts`: `LOG_LEVEL` defaults to `info`, empty counts as unset, accepts the six pino levels (`fatal` … `trace`) and `silent`, rejects anything else.

**Code:**
- `config.ts`: `LOG_LEVEL` → `config.logLevel` (zod enum, same `emptyAsUnset` pattern as the other variables).
- `logContext.ts`: `AsyncLocalStorage` of `{ job_id?, feed_id?, gmail_source_id? }`; `withLogContext( context, fn )` and `getLogContext()`.
- `logger.ts`: exactly the options in TRD §3.1. For tests the options live in an exported `createLogger( destination? )`; `logger` is `createLogger()` on stdout.
- `apps/server/.env.example` gets `LOG_LEVEL` in 3.4 with the other env files (kept in one place).

Red → green: modules and config key absent → tests fail on import/undefined; then the least code. Commit `feat(3.1): pino logger and log context`.

## Task 3.2: every `console.*` to the logger
**Call sites (25 outside `config.ts`):** `errors.ts:93`, `server.ts` (28, 38, 46, 62), `sources/video.adapter.ts:61`, `worker/sweeper.ts` (14, 17), `worker/intakePoller.ts` (17, 20, 27, 30), `worker/worker.ts:22`, `gmail/auth.ts` (159, 220, 239), `services/settings.service.ts:64`, `services/feeds.service.ts` (139, 366), `services/models.service.ts:38`, `services/gmailSources.service.ts` (340, 569, 573), `services/prompts.service.ts:178`, `services/gmail.service.ts:70`.
Each becomes `logger.<level>( { err, ...fields }, 'message' )`: fixed message text, variable parts as fields (`workDir`, `deleted`, `checked`, `feed_name`, `item_title`, `profile_id`), `error` → `warn` only where the code already used `console.warn`. `server.ts`'s `shutdown` `log:` option logs through `logger.info`. Item titles and subjects are logged only where the code logs them today (names, not content). Nothing logs bodies, note or transcript text, prompts, email content or tokens.

**Context:**
- `worker/worker.ts` (or `runJob`'s caller): `await withLogContext( { job_id: job.id }, () => runJob( job.id ) )`.
- `feeds.service.ts` `checkFeed` body and `checkDueFeeds`' per-feed loop: `{ feed_id }`; `gmailSources.service.ts` per-source check: `{ gmail_source_id }`. (Wrapped where the poller calls each unit so the line in the catch also carries the ID.)
- `assertMove` refusals logged: in `jobs/lifecycle.ts`'s caller `moveTo` (not in the pure module) as `logger.warn( { from, to, source_type }, 'Job move refused' )` just before rethrowing.

**Tests first:**
- `eslint.config.js`: add `'no-console': 'error'` first. `pnpm lint` fails on 25 sites (the red), except `config.ts`, which gets `// eslint-disable-next-line no-console -- runs before the logger exists`.
- Existing tests that spied on `console.*` change to spy on `logger` (TRD §10.1 allows it): `errors.test.ts`, `sources/video.adapter.test.ts`, `worker/{intakePoller,runJob,worker,sweeper}.test.ts`, `routes/{models,gmail,web}.routes.test.ts`, `gmail/auth.test.ts`, `services/{feeds.service,gmailSources.check,models.service,prompts.service}.test.ts`. I'll confirm per file whether it really spies or only mentions `console`; each changed file is named in the log line. Assertions keep their meaning (what was logged and at which level), now on `( fields, message )`.
- New tests: the worker runs a job inside a context with that `job_id` (a log line written from inside `runJob` carries it); same for a feed check and a Gmail source check; a refused move logs `Job move refused`.
- `dev` script: `tsx watch … src/server.ts | pino-pretty`; `start` stays raw JSON.

Commit `refactor(3.2): console to pino with job, feed and source context`.

## Task 3.3: request log middleware
**Tests first:** `middleware/requestLog.test.ts` (supertest on a small app with the middleware and a spy destination): logs `method`, `route` (matched pattern like `/jobs/:id`, falling back to the path for unmatched requests), `status`, `duration_ms` on `finish`; `info` below 500, `error` at 500+; skips `/api/health` and `/api/status`; no body, query string or headers in the line (a request with a sentinel body and `?token=` appears nowhere in the output).

**Code:** `middleware/requestLog.ts` (new folder), mounted first in `app.ts`. The route pattern comes from `req.baseUrl + req.route?.path` read on `finish`. `/api/status` doesn't exist until 5.5; the skip list is by path so it's ready.

Commit `feat(3.3): request log middleware`.

## Task 3.4: agent logging, `X-Job-Id`, env
**Tests first (agent, red first):**
- `tests/test_logging_setup.py`: `JsonFormatter` gives `time` (ISO 8601), `level` lowercase, `service: "agent"`, `msg`, `job_id` from the contextvar, `extra` fields, and `err` for an exception; `configure_logging` is idempotent and also routes `uvicorn` and `uvicorn.access` through it.
- `tests/test_config.py`: `LOG_LEVEL` default `info`, valid values accepted case-insensitively, invalid → `ConfigError`.
- `tests/test_main.py`: a request with a UUID `X-Job-Id` logs that `job_id`; a non-UUID or missing header gives no `job_id`; the var is reset after the request; a link run's captured log output contains none of the note's body (test body uses sentinels, same pattern as the existing no-secrets test).
- Server `clients/agent.client.test.ts`: `requestLinks` sends `X-Job-Id` inside a job context and none outside.

**Code:**
- `apps/agent/src/mnemosyne_agent/logging_setup.py` (new): `JsonFormatter`, `job_id_var`, filter, `configure_logging( level )`.
- `config.py`: `log_level` on `Settings`, parsed from `LOG_LEVEL`.
- `main.py`: replace the `StreamHandler` / `Formatter` lines in `__getattr__` with `configure_logging( settings.log_level )`; the `X-Job-Id` middleware inside `create_app`. The per-request line keeps its text (`"POST /health 405 12ms"`), and outcome, tool calls and tokens are additionally passed as `extra` fields, so the existing caplog tests pass unchanged.
- Server `agent.client.ts`: add the header in `requestLinks`'s call from `getLogContext().job_id`.
- Env: `LOG_LEVEL` in `docker-compose.yml` (both services, `${LOG_LEVEL:-info}`), the root `.env.example` and `apps/server/.env.example`. `apps/agent` has no `.env.example` (TRD §8 says "both"; I read that as these two), so I won't create one. Say so if you meant otherwise.
- `apps/server/CLAUDE.md` and `apps/agent/CLAUDE.md`: a short logging section each.

Commit `feat(3.4): agent JSON logs, X-Job-Id, LOG_LEVEL`.

## Points to note
- TRD §3.1 says 26 `console.*` calls; there are 26 including `config.ts`, so 25 convert.
- `redact` paths use `*.` so they match one level deep; top-level keys aren't covered. Tests pin that, and call sites log secrets-bearing objects under a named key only if they must (none do today).
- ADR 0049 doesn't change the TRD.

## Verification (end of checkpoint)
- `apps/server`: `pnpm test`, `pnpm lint` (zero `console` hits), `pnpm typecheck`, `pnpm build`.
- `apps/agent`: `uv run pytest`, `ruff check`, type check per its CLAUDE.md.
- `docker compose config` passes; `rg "console\." apps/server/src` shows only the `config.ts` line (and tests that no longer spy on it).
- Manual: run the server with `pnpm dev`, see pretty output; `LOG_LEVEL=debug` changes the level; a request to `/api/jobs` logs one line, `/api/health` none.
- Report per CLAUDE.md "Before you stop".
