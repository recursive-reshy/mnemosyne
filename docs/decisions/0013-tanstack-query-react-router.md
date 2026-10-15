# 0013. TanStack Query and React Router

- Status: Accepted
- Date: 2026-10-15
- Supersedes: the "no data-fetching library", hand-written polling and `?job=<id>` parts of 0011

## Context
0.2.0 adds a job list, a review screen and three mutations (save, discard, retry). Two screens share job data, and polling must stop and start by status. ADR 0011 said to revisit TanStack Query when there was more than one endpoint to cache.

## Decision
- **TanStack Query** for all server state: queries for the job list, a job and its transcript; mutations for save, discard and retry.
  - Polling uses `refetchInterval` by status.
  - Discard is optimistic; save waits for the server.
- **React Router** with two routes: `/` (home) and `/jobs/:id` (review). The job id moves from the query string into the path.
- The typed `api/` functions stay and are parsed with shared schemas; TanStack wraps them.
- Tests render through a `renderWithClient` helper (fresh client, retries off).

## Consequences
- The home list and review screen stay in sync through one cache.
- Two new dependencies.
- Express's existing `index.html` fallback already serves `/jobs/:id`.

## Alternatives considered
- **Keep hand-written hooks:** several polling hooks plus mutation and cache logic would reimplement TanStack badly.
- **Redux / RTK Query:** heavier, and nothing here needs a global client store.
