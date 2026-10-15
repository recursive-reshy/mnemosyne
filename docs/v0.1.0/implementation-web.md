# Implementation plan — apps/web

The web app is built in small slices, one handoff each, in the order below. Each slice is test-first (ADR 0007). The server is finished and exposes `POST /api/jobs`, `GET /api/jobs/:id` and `GET /api/jobs/:id/download` (see `docs/implementation-server.md`).

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done · ⏸️ Deferred

When a handoff is finished, its slice's status is set to ✅ and a one-line note is added to the log at the bottom.

## Overview

| ID | Slice | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 0** | **Foundation** | | |
| 0.1 | Reshape the template: package, tsconfigs, Vite config, alias | 0001, 0010, 0011 | ✅ |
| 0.2 | Tooling: Vitest, Testing Library, ESLint rules, first test | 0007, 0009, 0011 | ✅ |
| 0.3 | Function style: arrow functions except components and hooks | 0009, 0011 | ✅ |
| **Phase 1** | **Data** | | |
| 1.1 | `api/jobs.api.ts`: create job, get job, download URL | 0008, 0011 | ✅ |
| 1.2 | `useJob` hook: poll until `done` or `failed` | 0006, 0011 | ✅ |
| **Phase 2** | **Components** | | |
| 2.1 | `SubmitForm` | 0011 | ✅ |
| 2.2 | `JobProgress`: stage list and readable error | 0006, 0011 | ✅ |
| 2.3 | `DownloadLinks` | 0005, 0011 | ✅ |
| **Phase 3** | **The screen** | | |
| 3.1 | `App`: compose, `?job=<id>` in the URL, start over | 0011 | ✅ |
| 3.2 | Styling and a visual check in a browser | 0011 | ✅ |

After 3.1, server slice 6.3 (Express serves `apps/web/dist`) can be built.

## Slices

**0.1 Reshape the template** — Rename the package, keep the template's three tsconfigs with our options and the `#src/*` alias, rewrite `vite.config.ts` with the `/api` proxy, remove template files and comments, placeholder `App`.

**0.2 Tooling** — Add Vitest, jsdom, Testing Library and jest-dom with a setup file; replace the ESLint config with the server's style rules plus React hooks and JSX rules and a 150-line limit; remove `eslint-plugin-react-refresh` and `globals`; add `pnpm test`; test the placeholder `App`.

**0.3 Function style** — Components and hooks stay declarations; everything else is a `const` arrow function, enforced by `no-restricted-syntax`.

**1.1 API module** — `createJob( url )` posts to `/api/jobs` and returns the job id; `getJob( id )` returns a `Job`; `downloadUrl( id, format )` builds the link. Responses are parsed with the shared schemas. Errors carry the server's `error` message. Tests stub `fetch`.

**1.2 `useJob`** — given a job id (or `null`), returns `{ job, error }`. Fetches immediately, then every 2 seconds, and stops when the job is `done` or `failed` or the id changes or the component unmounts. A network error is returned as `error` and polling continues. Tests use fake timers.

**2.1 `SubmitForm`** — a labelled URL input and a Transcribe button. Disabled while submitting. Calls `onSubmit( url )`. Shows a validation message for an empty or non-http(s) URL before calling.

**2.2 `JobProgress`** — shows the job's stage (queued, downloading, converting, transcribing, done, failed) as a list with the current one marked, announced with `role="status"`. A failed job shows its `error` in a `role="alert"` and a Try again button.

**2.3 `DownloadLinks`** — three links (Markdown, SRT, TXT) for a finished job.

**3.1 `App`** — reads `?job=` on load, calls `createJob` on submit and writes the id to the URL, passes the job id to `useJob`, shows `SubmitForm` when there is no job and `JobProgress` and `DownloadLinks` otherwise, and has a Start over action that clears the URL.

**3.2 Styling** — CSS modules for layout, spacing, type and states; responsive; looked at in a real browser with the server running.

## Log

Newest at the bottom. One line per finished slice.
- 0.1 ✅ Template reshaped: `@mnemosyne/web`, our tsconfigs, `/api` proxy, placeholder `App`; the `#src/*` alias is a tsconfig `paths` entry resolved by Vite (`resolve.tsconfigPaths`), not a `package.json` `imports` field, because subpath imports need extensions.
- 0.2 ✅ Vitest, jsdom and Testing Library set up; ESLint matches the server's style plus React hooks, JSX and 150-line rules; `App` has its first test.
- 1.1 ✅ `api/jobs.api.ts` with `createJob`, `getJob`, `downloadUrl` and `ApiError`; `jobFixture`; `react-hooks/exhaustive-deps` is now an error.
- 1.2 ✅ `useJob` polls with a `setTimeout` chain, tags results with the job id, stops at `done`, `failed` or a 404; `request` in `jobs.api.ts` tidied.
- 2.1 ✅ `SubmitForm` validates with the shared `CreateJobBody`, with accessible error and submitting states; `useJob` non-`Error` fallback now tested.
- 2.2 ✅ `JobProgress`: stage list with `data-state`, `role="status"` line, failed state with `role="alert"` and Try again, connection error above the list.
- 2.3 ✅ `DownloadLinks`: Markdown, SRT and TXT links built with `downloadUrl`; Layers rule in `apps/web/CLAUDE.md` allows URL builders from `api/`.
- 3.1 ✅ `App` composes `SubmitForm`, `JobProgress` and `DownloadLinks`, keeps the job id in `?job=`, supports retry and start over; browser check not done by Claude.
- 0.3 ✅ Handlers, helpers, `api/` functions and test helpers are `const` arrow functions; components and hooks stay declarations, enforced by `no-restricted-syntax`; nothing inlined.
- 3.2 ✅ Minimal styling: `global.css` tokens for light and dark mode plus a CSS module per component; retry-failure test added; visual check left to Naresh.
- 3.2 follow-up ✅ Shared global `.alert` class for all alerts, every stage ticks green when done, red border on an invalid URL input.
