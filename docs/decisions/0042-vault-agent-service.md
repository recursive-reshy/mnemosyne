# 0042. A stateless Python vault agent service, with the vault mounted read-only

- Status: Accepted
- Date: 2026-10-21

## Context
v0.7.0 adds a linking agent that searches the Obsidian vault and proposes wikilinks for a new note. Later modules (the AI tutor, the business-idea validator) need the same thing: an agent that can list, search and read the vault. Until now every Claude call has been a single request from Express, and the only runtime has been Node. A tool-use loop could live in Express, but Naresh wants agent work in Python, and a separate service gives later agents a home.

## Decision
- **A new app, `apps/agent`,** a Python 3.14 / FastAPI service built with uv, Ruff, Pyright (strict) and pytest. Naresh initializes the project; its own `CLAUDE.md` holds the Python house style.
- **Stateless.** No database, no files written, no caches or module-level mutable state. Each request carries the note, the model and the guidance it needs.
- **Express stays the orchestrator.** It owns jobs, SQLite, the review queue, usage and cost records and every vault write. The service only reads the vault and calls Claude.
- **Read-only by construction.** The vault is mounted `:ro` and the container runs with `read_only: true` (a tmpfs for `/tmp`). Every path a tool opens is resolved and must stay inside the vault root.
- **Private.** A second service in the existing Compose file with no host port, reached by Express at `AGENT_URL` (`http://agent:8100`) with a shared secret (`AGENT_SECRET`, sent as a bearer token and compared in constant time). It receives only `ANTHROPIC_API_KEY`, `AGENT_SECRET` and `VAULT_PATH`, not the whole `.env`.
- **Optional at runtime.** No `depends_on` either way. Express checks `/health`; when the service is down, linking fails softly and jobs still reach review.
- **Named for its future, not its first job.** Linking is the first endpoint (`/v1/link`); the tutor and the validator are expected to add endpoints, reusing the vault tools.
- `apps/agent/package.json` wraps `uv run pytest`, `uv run ruff check` and `uv run pyright` as `test`, `lint` and `typecheck`, so the root `pnpm` scripts cover it.

## Consequences
- A second runtime, image and lockfile to maintain.
- Vault tools are written once and shared by every later agent.
- The service cannot corrupt the vault even if its code is wrong.
- Linking is unavailable when the container is down, which the app shows rather than hides.

## Alternatives considered
- **A tool-use loop in Express (TypeScript):** one runtime and faster to ship, but every later agent would grow inside the API server, and Naresh prefers Python for agent work.
- **A Python service with its own database:** state belongs to Express; two stores of job data would drift.
- **Exposing the service on a host port:** only useful for debugging, and it would let anything on the Mac spend the API key.
