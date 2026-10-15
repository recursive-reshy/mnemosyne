# 0012. SQLite job store with better-sqlite3

- Status: Accepted
- Date: 2026-10-15
- Supersedes: the in-memory job store in 0006

## Context
In 0.1.0 a job finished in minutes, so losing jobs on restart was acceptable (ADR 0006). In 0.2.0 a job waits up to 24 hours for review with its transcript and summary. A container restart or Docker Desktop update would throw that work away.

## Decision
- Persist jobs in SQLite through **better-sqlite3**, in `${DATA_DIR}/mnemosyne.db` (WAL mode), on a Docker named volume.
- Keep the repository's synchronous free-function API; only the storage behind it changes. No ORM: raw SQL in the repository.
- Migrations are ordered SQL strings tracked with `PRAGMA user_version`.
- The transcript is stored as JSON and parsed with the shared `Transcript` schema on read.
- On startup, jobs left in `downloading`, `converting` or `transcribing` are marked `failed`; `summarizing` jobs are resumed by the worker.
- Tests open `':memory:'` databases.

## Consequences
- Jobs and reviews survive restarts and rebuilds.
- A native module: it needs `allowBuilds` in `pnpm-workspace.yaml` and must be installed inside the Docker build, never copied from the host.
- Saved jobs stay as lightweight history rows (transcript removed).

## Alternatives considered
- **`node:sqlite`:** no dependency, but its stability depends on the Node version; better-sqlite3 is proven and Naresh has used it.
- **JSON file:** simple, but no safe concurrent writes or queries.
- **An ORM (Drizzle, Prisma):** more setup than one table needs.
