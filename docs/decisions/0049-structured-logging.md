# 0049. Structured logs: pino in the server, a JSON formatter in the agent, the job ID across both

- Status: Proposed
- Date: 2026-10-21

## Context
The server logs with 26 `console.*` calls and has no request log. The agent logs plain text through `logging`. Nothing ties a link run in the agent to the job in the server, and a failing poller or job can only be found by reading unstructured lines in `docker compose logs`.

## Decision
- **Server:** `pino`, one JSON object per line, `level` as a label, ISO time, `service: "server"`. `LOG_LEVEL` sets the level (default `info`). `pino-pretty` only in the `dev` script.
- **Context without threading:** an `AsyncLocalStorage` holds `job_id`, `feed_id` or `gmail_source_id`; the worker and pollers set it around each unit of work, and pino's `mixin()` adds it to every line.
- **Requests:** a hand-written middleware logs method, route, status and duration; health and status endpoints are skipped. No `pino-http`.
- **Agent:** no new dependency. A JSON formatter on `logging` with the same field names, `service: "agent"`, and a `contextvars` filter for `job_id`; uvicorn's loggers use it.
- **Across services:** the server sends `X-Job-Id` on agent calls. It is a header, not a contract field, so ADR 0043's contract doesn't change.
- **Never logged:** bodies, note and transcript text, prompts, email content, tokens and keys. pino `redact` covers token- and key-named fields; tests check redaction and that a link run's log has no note text.
- `no-console` is an ESLint error in `apps/server`, except the one line in `config.ts` that runs before the logger.

## Consequences
- `docker compose logs mnemosyne agent | grep <job id>` follows one job end to end, and the logs can be filtered with `jq`.
- One new runtime dependency in the server.
- Tests that spied on `console` spy on the logger instead.

## Alternatives considered
- **A hand-written JSON logger (about 40 lines):** no dependency, but redaction, error serialization and pretty printing would all be ours to write and test.
- **`pino-http`:** a second dependency for what a 15-line middleware does.
- **`structlog` in the agent:** nicer API, but a dependency for one formatter.
- **Job ID in the agent contract:** would change the Pydantic models, the schema export, the examples and the Zod mirror for a logging concern.
