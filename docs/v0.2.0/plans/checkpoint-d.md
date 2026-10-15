# Checkpoint D plan: Phase 6 (web foundation)

## Context
The server side of 0.2.0 is done (jobs list, transcript, save, retry, discard). Before the review screen is built in Checkpoint E, the web app moves onto the foundations ADR 0013 chose: TanStack Query for server state and React Router for `/` and `/jobs/:id`, plus typed API functions for the new endpoints. This checkpoint is a refactor: the screens a user sees today (submit form, progress, downloads) keep working, except that the job id moves from `?job=<id>` into the path. New dependencies are named in TRD §2: `@tanstack/react-query` and `react-router`. ADRs: 0013 (supersedes parts of 0011), 0008. Test-first per task; one commit each, pushed; after each task run `test`, `lint`, `typecheck` in `apps/web` (and `build` at the end).

## Points to confirm
1. **Query client defaults:** `retry: false` and `refetchOnWindowFocus: false`. The 0.1.0 hook retried only by polling again every 2 s and never fetched on focus; these defaults keep request patterns identical. Polling is `refetchInterval` by status, and it continues after a transient error, as before.
2. **Old `?job=<id>` links are not redirected.** 0.1.0 jobs lived in memory and are gone anyway. Say if you want a one-line redirect.
3. **Page components live in `components/`** as `HomePage` and `JobPage` folders (same one-folder-per-component rule), so no new top-level folder is introduced. In Checkpoint E `JobPage` becomes the review screen.
4. **An invalid id in `/jobs/:id`** (not a UUID) redirects to `/` with `replace`, mirroring today's "ignore and clean the address".
5. **`useJob` keeps its return shape** `{ job, error }`, so the page components and their tests keep mocking it the way `App.test.tsx` does today; richer hooks (`useJobs`, `useTranscript`, mutations) arrive in Checkpoint E.
6. **Web `CLAUDE.md` is updated in the same commits** that change what it describes (stack, folder list, `window.location` rule, test helper), per the root precedence rule.

## Tasks

### 6.1 TanStack Query, provider, `renderWithClient`, `useJob` on `useQuery`
- Files: `apps/web/package.json` (+ `@tanstack/react-query`), `src/queryClient.ts` + `.test.ts` (`createQueryClient()`), `src/main.tsx` (`QueryClientProvider`), `src/hooks/queryKeys.ts` (`jobKeys`: `['jobs']`, `['jobs', id]`, `['jobs', id, 'transcript']`), `src/hooks/useJob.ts` + `.test.ts`, `src/test-support/renderWithClient.tsx` (a fresh client with retries off; exposes `renderWithClient` for components and `renderHookWithClient` for hooks), `src/App.test.tsx` only if its render needs the provider, `apps/web/CLAUDE.md`.
- Tests first:
  - `createQueryClient` defaults (`retry: false`, `refetchOnWindowFocus: false`).
  - The existing `useJob` suite, run through `renderHookWithClient` with unchanged assertions: nothing without an id; fetch at once; poll every 2 s while unfinished; stop at `ready_for_review` / `summary_failed` / `saved` / `failed`; never overlapping requests; keep the last job on a transient error and recover; 404 gives `job: null` plus the "no longer exists" message and stops; ignore a late response for an old id; stop when the id becomes null.
  - New (red against the hand-written hook): two components using `useJob( 'a' )` share one request; a second observer of a cached job gets it synchronously.
- Code: `useJob` becomes `useQuery( { queryKey: jobKeys.detail( id ), queryFn: () => getJob( id ), enabled: id !== null, refetchInterval } )` with the interval function returning `false` for finished statuses or a 404 and `POLL_INTERVAL_MS` otherwise; the same `{ job, error }` result, with 404 mapped to `null` plus the gone message. Export `POLL_INTERVAL_MS` as today.

### 6.2 React Router: `/` and `/jobs/:id`
- Files: `apps/web/package.json` (+ `react-router`), `src/main.tsx` (`BrowserRouter`), `src/App.tsx` (heading, card, `Routes`), new `src/components/HomePage/` and `src/components/JobPage/` (each with `index.ts`, `.tsx`, `.module.css` as needed, `.test.tsx`), `src/test-support/renderWithClient.tsx` (adds a `MemoryRouter` with a `route` option and a way to read the current location), `src/App.test.tsx`, `apps/web/CLAUDE.md`.
- Tests first (App and page tests rewritten from the `?job=` versions; same scenarios):
  - `/` shows the heading and the submit form; submitting calls `createJob`, disables the button while starting, then navigates to `/jobs/<new id>`; a failed submit shows the alert and re-enables the button.
  - `/jobs/:id` shows "Loading job…" until the job arrives, then progress; downloads appear for `ready_for_review` / `summary_failed` and not while running or summarizing; a connection error shows next to the job; a vanished job shows the message and "Start over", which goes to `/`.
  - "Try again" on a failed job creates a job with its URL and navigates to the new job; if that fails, the alert shows and the address stays on the old job.
  - "Transcribe another video" goes to `/`.
  - A non-UUID id redirects to `/`.
- Code: `HomePage` (SubmitForm, `useNavigate`), `JobPage` (`useParams`, `useJob`, `JobProgress`, `DownloadLinks`, start-over and retry handlers), `App` composes them. `window.location` is no longer touched outside the router.

### 6.3 API client functions for the new endpoints
- Files: `src/api/jobs.api.ts` + `jobs.api.test.ts`.
- Tests first (fetch stubbed with `vi.stubGlobal`, as in the existing suite): for each function, the URL, method and body it sends, and the parsed return value:
  - `listJobs()` → `GET /api/jobs` returns `Job[]`.
  - `getTranscript( id )` → `GET /api/jobs/:id/transcript` returns `Transcript`.
  - `saveJob( id, body )` → `POST /api/jobs/:id/save` with JSON, returns the `saved_path` string.
  - `retrySummary( id )` → `POST /api/jobs/:id/retry-summary` returns the `Job`.
  - `discardJob( id )` → `DELETE /api/jobs/:id`; a `204` with no body resolves to `undefined`.
  - Shared behaviour for each: the server's `{ error }` message on a non-2xx (409, 404), a readable message on a network failure, and "Unexpected response" on a malformed body; ids are URL-encoded.
- Code: extend the private `request` helper to accept "no body expected" for the 204 case; the functions return plain values (no TanStack in this layer). No hooks are added yet.

## Verification
- Per task: new tests fail first for the stated reason, then pass; `pnpm test`, `lint`, `typecheck` in `apps/web`.
- End of checkpoint: root `pnpm test`, `lint`, `typecheck`, `build`.
- UI check (web `CLAUDE.md` asks for it after a UI slice): run the dev server with the API behind it and look at `/` and `/jobs/<id>` in a browser, if a browser tool is available in this session. Otherwise I'll say it was not done and instead confirm with the built app served by Express (`WEB_DIR`) that `/jobs/<uuid>` returns `index.html` and the submit → navigate → progress flow works against a real job that fails at download.
- Report: tasks with commit hashes, per-folder results, existing tests changed (the `useJob` and `App` suites), and anything not verified.
