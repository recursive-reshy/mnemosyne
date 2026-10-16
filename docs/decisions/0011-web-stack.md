# 0011. Web app: Vite, React, plain CSS, hand-written polling

- Status: Accepted; Superseded in part by 0013 (data fetching, routing) and 0024 (styling)
- Date: 2026-10-14

## Context
The web app is one screen: submit a URL, watch the job progress, download the transcript. It talks to the server's JSON API (ADR 0006) and shares contracts with it (ADR 0008). It is served by Express in production (ADR 0004), so it needs no server of its own.

## Decision
- **Vite + React + TypeScript (strict)**, built to static files in `apps/web/dist`.
- **Vitest + React Testing Library + user-event** (jsdom) for tests, queried by role and label.
- **Plain CSS with CSS modules**; no UI library, no Tailwind.
- **No data-fetching library.** A small `useJob` hook polls `GET /api/jobs/:id` every 2 seconds until the job is `done` or `failed`.
- **Same-origin API:** the app calls relative `/api/...` URLs. In development Vite proxies `/api` to `http://localhost:3100`; in production Express serves both.
- **Downloads are plain links** to `/api/jobs/:id/download?format=…`, not fetches.
- **The job id lives in the page URL** (`?job=<id>`), so a refresh or bookmark resumes the job.
- Responses are parsed with the schemas in `@mnemosyne/shared`; the web app defines no wire shapes of its own.

## Consequences
- Few dependencies, and the whole app is easy to read.
- Switching polling to SSE later (ADR 0006) only changes `useJob`.
- There is no job history: the server has no list endpoint, and the page shows one job at a time.
- Styling is by hand, so a design pass is its own slice.

## Alternatives considered
- **Next.js:** server rendering and routing aren't needed, and it would add a second server.
- **TanStack Query:** good for caching and polling, but one polling hook doesn't justify it. Revisit when there is more than one endpoint to cache.
- **Tailwind or a component library:** faster to start, but more dependencies and a look that isn't ours for a one-screen app.