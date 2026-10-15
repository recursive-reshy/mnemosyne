# Implementation plan — apps/server

The server is built in small slices, one handoff each, in the order below. Each slice is test-first (ADR 0007): its handoff lists the tests to write before any code.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done · ⏸️ Deferred

When a handoff is finished, its slice's status is set to ✅ and a one-line note is added to the log at the bottom.

## Overview

| ID | Slice | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 0** | **Foundation** | | |
| 0.1 | Tooling and scripts | 0001, 0007, 0009 | ✅ |
| 0.2 | `app.ts`, `server.ts` and `GET /api/health` | 0007 | ✅ |
| 0.3 | Typed errors and error middleware | 0008 | ✅ |
| 0.4 | `config.ts`: environment parsed with Zod | 0004, 0008 | ✅ |
| 0.5 | ESLint config, check-only | 0009 | ✅ |
| **Phase 1** | **Shared contracts** | | |
| 1.1 | `packages/shared`: Zod schemas and types | 0001, 0005, 0008 | ✅ |
| **Phase 2** | **Jobs API (no processing yet)** | | |
| 2.1 | Job store repository | 0006 | ✅ |
| 2.2 | Jobs service: create, find, status changes | 0006 | ✅ |
| 2.3 | `POST /api/jobs` and `GET /api/jobs/:id` | 0006, 0008 | ✅ |
| **Phase 3** | **Formatters and download** | | |
| 3.1 | TXT formatter | 0005 | ✅ |
| 3.2 | SRT formatter | 0005 | ✅ |
| 3.3 | Markdown formatter | 0005 | ✅ |
| 3.4 | `GET /api/jobs/:id/download` | 0005, 0006 | ✅ |
| **Phase 4** | **Clients** | | |
| 4.1 | yt-dlp client | 0003 | ✅ |
| 4.2 | ffmpeg client | 0003 | ✅ |
| 4.3 | whisper-server client | 0002, 0004 | ✅ |
| **Phase 5** | **Worker** | | |
| 5.1 | Run one job through the pipeline | 0003, 0006 | ✅ |
| 5.2 | Worker loop, started from `server.ts` | 0006 | ✅ |
| **Phase 6** | **Integration and runtime** | | |
| 6.1 | Integration tests against the real tools | 0007 | ✅ |
| 6.2 | Dockerfile, compose, `.env.example`, launchd plist | 0004 | ✅ |
| 6.3 | Serve the built web app from Express | 0004 | ✅ |
| **Phase 7** | **Maintenance** | | |
| 7.1 | Function style: arrow functions | 0009 | ✅ |
| 7.2 | Graceful shutdown | 0004, 0006 | ✅ |
| 7.3 | Root README for 0.1.0 | — | ✅ |

## Slices

### Phase 0 — Foundation

**0.1 Tooling and scripts**
- Align the server's `package.json` and `tsconfig.json` with `apps/server/CLAUDE.md`: Node 24, ESM, strict TS, Express 5, `tsx` for dev, `tsc` build to `dist/`, `#src/*` subpath alias with the `development` condition.
- Add Vitest and Supertest; scripts `test`, `typecheck`, `build`, `dev`.
- Root `package.json` scripts run them across workspaces.
- Done when: a trivial test passes through `pnpm test` from the root, and `pnpm typecheck` and `pnpm build` succeed.

**0.2 `app.ts`, `server.ts` and `GET /api/health`**
- `app.ts` builds and exports the Express app; `server.ts` only listens.
- `GET /api/health` → 200 `{ status: 'ok' }`.
- Tests: through `app.ts` with Supertest.

**0.3 Typed errors and error middleware**
- `ValidationError` 400, `NotFoundError` 404, `ConflictError` 409; `ZodError` → 400; anything else → 500 `{ error: 'Internal Server Error' }` and logged.
- Unknown `/api/*` routes → 404.
- Tests: a test-only route that throws each error type, checked through `app.ts`.

**0.4 `config.ts`**
- Parse `PORT`, `WHISPER_URL`, `WORK_DIR` with Zod, with the defaults in the server `CLAUDE.md`. Invalid values fail at startup with a clear message.
- Tests: defaults, overrides, invalid `WHISPER_URL`.

**0.5 ESLint, check-only**
- ESLint config enforcing the style in `apps/server/CLAUDE.md` (spacing, no semicolons, single quotes, 100-character lines, one argument per line when broken, import rules). No formatter, no `--fix` in scripts.
- Done when: `pnpm lint` passes on the existing code and fails on a deliberately mis-styled sample.

### Phase 1 — Shared contracts

**1.1 `packages/shared`**
- Zod schemas with inferred types: `JobStatus` (`queued | downloading | converting | transcribing | done | failed`), `Segment` (start, end in seconds, text), `TranscriptMeta` (title, source URL, channel, duration, transcribed date, model), `Transcript`, `Job`, `CreateJobBody` (`url`, http/https only), `CreateJobResponse`, `DownloadFormat` (`md | srt | txt`).
- Package name `@mnemosyne/shared`, consumed by the server through the workspace.
- Tests: valid and invalid samples for each schema.

### Phase 2 — Jobs API

**2.1 Job store repository**
- In-memory `Map`: create, find by id, update, find next `queued` job (oldest first), reset (for tests).
- Tests: at the repository.

**2.2 Jobs service**
- `queueJob`, `findJob` (throws `NotFoundError`), `markStatus`, `completeJob`, `failJob`.
- Only forward status moves are allowed; `done` and `failed` are final. An illegal move throws `ConflictError`.
- Tests: at the service.

**2.3 `POST /api/jobs` and `GET /api/jobs/:id`**
- `POST` with a valid URL → 202 `{ job_id }`; invalid body → 400.
- `GET` → 200 with the job's status, progress fields and `error` if failed; unknown id → 404.
- Tests: through `app.ts`.

### Phase 3 — Formatters and download

**3.1 TXT** — plain text, paragraphs only, no timestamps.

**3.2 SRT** — numbered cues with `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamps.

**3.3 Markdown**
- YAML frontmatter (`title`, `source`, `channel`, `duration`, `transcribed`, `model`, `tags`), a `#` title, then paragraphs grouped from segments, each starting with a timestamp link back to the video.
- Paragraph grouping rule and frontmatter escaping are specified in the handoff.

All three: pure functions, tested with a fixed transcript in and an exact string out.

**3.4 `GET /api/jobs/:id/download?format=md|srt|txt`**
- Default `md`. Responds with the right content type and an attachment filename derived from the title.
- Job not `done` → 409; unknown id → 404; bad format → 400.
- Tests: through `app.ts`, with jobs seeded through the service.

### Phase 4 — Clients

**4.1 yt-dlp client** — download best audio to the job's work folder and return its path plus metadata parsed with Zod. Failures throw with a readable message.

**4.2 ffmpeg client** — convert to 16 kHz mono WAV and return the new path.

**4.3 whisper-server client** — send the WAV to `WHISPER_URL` and parse the response into `Segment[]`. The exact endpoint and response format are confirmed against the installed whisper-server version in the handoff.

All three: tests mock `node:child_process` or `fetch` and assert on the command or request built and how output is parsed.

### Phase 5 — Worker

**5.1 Run one job**
- Moves the job through `downloading → converting → transcribing → done`, or `failed` with a readable error at any step. Deletes the job's work files either way.
- Tests: clients mocked with `vi.mock`; success path, a failure at each step, cleanup always runs.

**5.2 Worker loop**
- Processes one job at a time, picks up the next `queued` job when free, and is started from `server.ts`. A failing job never stops the loop.
- Tests: fake timers; two queued jobs run in order, never at the same time.

### Phase 6 — Integration and runtime

**6.1 Integration tests** — `*.integration.test.ts` and `pnpm test:integration`: a short public video through the real yt-dlp, ffmpeg and whisper-server, end to end.

**6.2 Runtime** — multi-stage `Dockerfile`, `docker-compose.yml` (port 3100, `WHISPER_URL`, yt-dlp updated on start), `.env.example`, and `ops/com.naresh.whisper-server.plist`.

**6.3 Serve the web app** — Express serves the built React app in production. Deferred until `apps/web` exists.

### Phase 7 — Maintenance

**7.1 Function style** — Convert all functions to `const` arrow functions (hoisting exceptions only), enforced by `func-style`.

**7.2 Graceful shutdown** — SIGTERM/SIGINT stop new work, wait up to 60 s for the running job, then exit; a second signal exits at once; leftover work files cleared at start.

**7.3 Root README for 0.1.0** — A root README covering what Mnemosyne is, setup, use, configuration, development and troubleshooting.

## Log

Oldest first; new lines go at the bottom.

| Date | Slice | Note |
| --- | --- | --- |
| 2026-10-14 | 0.2 | `app.ts`, `server.ts` and `GET /api/health` with 3 Supertest tests; toolchain test removed; `pnpm build` verified |
| 2026-10-14 | 0.1 | Workspace, scripts, Vitest and toolchain test in place; `pnpm build` is verified in slice 0.2 (no non-test source yet) |
| 2026-10-14 | 0.5 | ESLint flat config on TypeScript 6.0.3 (ADR 0010); `pnpm lint` passes and flags a mis-styled sample |
| 2026-10-14 | 0.3 | `errors.ts` with typed errors, `notFoundHandler` and `errorMiddleware`, mounted in `app.ts`; 9 new tests |
| 2026-10-14 | 0.4 | `config.ts` with `loadConfig`, default port 3100, `.env.example`; server listens on `config.port` |
| 2026-10-14 | 1.1 | `@mnemosyne/shared` with job, transcript, api and error schemas (46 tests); server types error bodies with `ErrorResponse` |
| 2026-10-14 | 0.4 | Invalid environment at startup prints only the `Invalid environment:` message to stderr and exits 1, no stack trace |
| 2026-10-14 | 2.1 | In-memory job store (`jobStore.repository.ts`) with copy-in/copy-out and local `StoredJob`; 13 tests |
| 2026-10-14 | 2.2 | Jobs service (`jobs.service.ts`): queue, find, status transitions with `ConflictError` on illegal moves; 23 tests |
| 2026-10-14 | 2.3 | `POST /api/jobs` (202 + Location) and `GET /api/jobs/:id`; `express.json()` and malformed JSON → 400; production build resolves shared at runtime |
| 2026-10-14 | 3.1–3.3 | Pure TXT, SRT and Markdown formatters with shared timestamp, paragraph and YouTube-id helpers; 61 new tests |
| 2026-10-14 | 3.4 | `GET /api/jobs/:id/download` with `renderTranscript` in the jobs service and `transcriptFilename`; 30 new tests |
| 2026-10-14 | 4.3 | `transcribeAudio` whisper-server client (multipart `/inference`, local Zod parse, trimmed shared `Segment`s); 12 tests |
| 2026-10-14 | 4.1 | `runCommand` helper (`execFile`, typed error messages) and `downloadAudio` yt-dlp client; single `--print` + download call confirmed against the real tool; 20 tests |
| 2026-10-14 | 4.2 | `convertToWav` ffmpeg client (16 kHz mono PCM WAV via `runCommand`, output size check); 7 tests; real-tools chain check blocked at yt-dlp by HTTP 403 |
| 2026-10-14 | 4.2 | Real-tools chain check (yt-dlp → ffmpeg → whisper-server) passed on rerun after a transient 403: 129 segments from a 517 s video |
| 2026-10-14 | 5.1 | `runJob` runs one queued job through download, convert and transcribe, with one 3 s retry on a 403 download and `WHISPER_MODEL` as the transcript's model label; work folder always removed; 19 new tests |
| 2026-10-14 | 5.2 | `startWorker` polls every 1 s and drains the queue one job at a time; `findNextQueuedJob` added to the jobs service; started from `server.ts`; 13 new tests |
| 2026-10-14 | 6.1 | `pipeline.integration.test.ts`: failure path then real 8.6 min video through the API and worker, plus work-folder cleanup; integration config gets longer timeouts and no file parallelism; passes in ~14 s |
| 2026-10-14 | 6.2 | Multi-stage Dockerfile (`pnpm deploy --legacy`, ffmpeg, standalone yt-dlp with `--js-runtimes node`), compose with healthcheck, entrypoint, launchd plist and ops README; image runs healthy and reaches whisper-server |
| 2026-10-15 | 7.1 | All functions in server and shared are `const` arrow functions, enforced by `func-style: expression`; no hoisting exceptions, nothing inlined |
| 2026-10-15 | 6.3 | `WEB_DIR` config and `web.routes.ts` (static, immutable assets, `index.html` fallback for extensionless paths); Docker image builds the web app to `/app/web`; 12 new server tests |
| 2026-10-15 | 7.2 | `startWorker`'s stop now returns a promise that waits for the running job; `shutdown.ts` handles SIGTERM/SIGINT with a 60 s timeout; work dir cleared at boot; compose `stop_grace_period: 75s`; 8 new tests |
| 2026-10-15 | 7.3 | Root `README.md` written; `version` 0.1.0 added to root and web `package.json`; commands and model URLs checked against the repo |
