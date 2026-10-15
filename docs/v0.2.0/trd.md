# Mnemosyne v0.2.0 — Technical Requirements

Companion to `docs/v0.2.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.1.0 code at commit `9f84aa9`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet.

## 1. Changes at a glance
- **Shared:** new job statuses (`done` is removed), extended `Job` DTO, new request/response schemas, the filename sanitizer moves here from the server.
- **Server:** the job store moves from a module-level `Map` to SQLite behind the same repository functions; the worker gains a summarize step; new Claude and vault clients; new endpoints; a cleanup sweeper; startup recovery.
- **Web:** TanStack Query and React Router replace hand-written polling and `?job=<id>`; new home job list and review screen; localStorage drafts.
- **Infra:** a named volume for the database, a bind mount for the vault, new env vars, `better-sqlite3` allowed to build.

## 2. Packages
| Package | Where | Why |
|---|---|---|
| `@anthropic-ai/sdk` | server | Claude client (ADR 0014) |
| `better-sqlite3`, `@types/better-sqlite3` | server | Job persistence (ADR 0012) |
| `@tanstack/react-query` | web | Server state, polling, mutations (ADR 0013) |
| `react-router` | web | `/` and `/jobs/:id` (ADR 0013) |

- No YAML library: note frontmatter reuses the quoting helpers already in `markdown.formatter.ts` (extracted so both formatters share them).
- `better-sqlite3` is a native module. Add `better-sqlite3: true` under `allowBuilds` in `pnpm-workspace.yaml`, or pnpm skips its install script. It is installed inside the Docker build stage (already the case for all deps); if no prebuilt linux-arm64 binary is found, the build stage needs `python3 make g++`.

## 3. Job lifecycle

### 3.1 Statuses (`packages/shared/src/job.ts`)
`queued → downloading → converting → transcribing → summarizing → ready_for_review → saved`

- `summary_failed`: summarization failed; transcript kept; retryable.
- `failed`: download/convert/transcribe failed, or interrupted by a restart.
- `done` is removed. Discard deletes the row, so there is no `discarded` status.

### 3.2 Transitions (all in `jobs.service.ts`)
| From | Event | To | Service function |
|---|---|---|---|
| `transcribing` | transcript ready | `summarizing` | `completeTranscription` (replaces `completeJob`) |
| `summarizing` | summary valid | `ready_for_review`, sets `expires_at` | new `completeSummary` |
| `summarizing` | error / invalid response | `summary_failed`, sets `error`, `expires_at` | new `failSummary` |
| `summary_failed` | retry | `summarizing`, clears `error`, `expires_at` | new `retrySummary` |
| `ready_for_review` | save | `saved`, sets `saved_path`, nulls transcript | new `saveJob` |
| `ready_for_review` / `summary_failed` | discard | row deleted | new `discardJob` |
| `ready_for_review` / `summary_failed` | `expires_at` passed | row deleted | new `deleteExpiredJobs` |
| `downloading` / `converting` / `transcribing` | server start | `failed`, `error: 'Interrupted by restart'` | new `recoverInterruptedJobs` |

- `failJob` must also refuse `ready_for_review`, `summary_failed` and `saved`.
- Invalid transitions throw `ConflictError` (409), as today.
- Status changes still only go through the jobs service (ADR 0006), so SSE stays possible later.

### 3.3 Worker
- The worker picks the oldest job that is `queued` **or** `summarizing`. Because it runs one job at a time and only looks for the next job when the current one has finished, a `summarizing` job found at that point is never in flight: it is a retry or a job interrupted by a restart.
- `queued` → full pipeline (today's `runJob`), then the summarize step.
- `summarizing` → summarize step only, from the stored transcript.
- So startup recovery leaves `summarizing` jobs alone, and the worker resumes them. Only the download/convert/transcribe statuses are marked `failed`.
- Audio is still deleted by `runJob`'s `finally` as soon as transcription ends. Nothing in 0.2.0 deletes audio later.

## 4. Data

### 4.1 Shared DTO (`Job`), snake_case like the rest of the wire format
Existing: `id`, `url`, `status`, `error`, `created_at`, `updated_at`. New:
- `title: string | null`: from the transcript's `meta.title`; null until transcribed
- `summary_markdown: string | null`: the editable note body (§5.4)
- `suggested_tags: string[]`: empty until summarized
- `expires_at: string | null`: ISO datetime
- `saved_path: string | null`: vault-relative path, e.g. `Mnemosyne/What Is RAG.md`

New schemas in `api.ts`: `ListJobsResponse { jobs: Job[] }`, `GetTranscriptResponse { transcript: Transcript }`, `SaveJobBody { title, tags, body }`, `SaveJobResponse { saved_path }`.

### 4.2 SQLite
- File `${DATA_DIR}/mnemosyne.db`, WAL mode.
- `repositories/jobStore.repository.ts` keeps its synchronous free-function API (`insertJob`, `findJobById`, `updateJob`, `findNextQueuedJob`, `clearJobs`); only the storage behind it changes. better-sqlite3 is synchronous, so callers don't change.
- New repository functions: `openJobStore( path )` / `closeJobStore()` (called from `server.ts` and `shutdown.ts`; tests open `':memory:'`), `listActiveJobs`, `findNextRunnableJob` (replaces `findNextQueuedJob`), `findExpiredJobs( now )`, `deleteJob`, `markInterruptedJobs`.
- Migrations: ordered SQL strings in the repository, tracked with `PRAGMA user_version`, run by `openJobStore`.

`jobs` table:
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | uuid |
| `url` | TEXT NOT NULL | |
| `status` | TEXT NOT NULL | §3.1 |
| `error` | TEXT | |
| `title` | TEXT | copied from the transcript so saved rows keep it |
| `transcript` | TEXT | `Transcript` as JSON, parsed with the shared schema on read; NULL after save |
| `summary_markdown` | TEXT | |
| `suggested_tags` | TEXT NOT NULL DEFAULT '[]' | JSON array |
| `saved_path` | TEXT | |
| `expires_at` | TEXT | |
| `created_at`, `updated_at` | TEXT NOT NULL | ISO 8601 |

Saved rows are kept as lightweight history (transcript removed) and excluded from `listActiveJobs`.

## 5. Summarizer

### 5.1 Client (`clients/claude.client.ts`, new)
```ts
type SummaryInput = { transcript: Transcript }
type Timestamped = { text: string, seconds: number }
type SummaryResult = { overview: string, key_points: Timestamped[], quotes: Timestamped[], tags: string[] }

export const summarizeTranscript = async ( input: SummaryInput ): Promise< SummaryResult >
```
- One external tool per client, like the other clients. Tests mock the module, following the existing client tests. Moving the summarizer to a Python service later means replacing this module only.
- The model comes from a small `settings.ts` (new) whose `getSummaryModel()` returns `claude-sonnet-5-5`, so model selection from the UI (KIV) touches only that module.
- `SummaryResult` is a Zod schema in the server (not shared: the web app never sees it).

### 5.2 API call
- One Messages API call. Structured output via the API's structured-output support or a forced tool call: check the current SDK API with Context7 before planning.
- The transcript is sent as `[seconds] text` lines (one per segment) so the model can cite seconds.
- `max_tokens` around 4000; timeout from `SUMMARY_TIMEOUT_MS`; at most one SDK retry for transient errors.
- Prompt (generic, tuned later): summarize the talk's main argument in a few paragraphs; extract key points and verbatim notable quotes, each with the second it occurs; suggest 3–5 topical tags.

### 5.3 Clean-up (pure, `formatters/summary.cleanup.ts`, new)
- Quotes: keep only those found verbatim in the joined segment text after whitespace normalization.
- Drop key points and quotes with `seconds < 0` or `> meta.duration_seconds`.
- Tags: lowercase, spaces → hyphens, strip other invalid characters, dedupe, drop `mnemosyne`, cap at 5.
- A response that fails Zod parsing → `summary_failed`.

### 5.4 Rendering (`formatters/summary.formatter.ts`, new)
```markdown
## Summary
…

## Key points
- Point ([12:34](https://youtu.be/<id>?t=754))

## Notable quotes
> "…" ([1:05:20](https://youtu.be/<id>?t=3920))
```
- Reuses `formatClock` and `youTubeVideoId`, and the same `https://youtu.be/<id>?t=<s>` link form as the transcript formatter.
- Non-YouTube sources get `[12:34]` without a link.

## 6. Vault

### 6.1 Note (`formatters/note.formatter.ts`, new)
Frontmatter, then the user-edited body:
```yaml
title: "…"
source: "…"
channel: "…"
duration: "1:42:10"
created: 2026-10-15
tags: [mnemosyne, …]
```
- `title` is the user-edited title; `source`, `channel`, `duration` come from the stored transcript's `meta`; `created` is the save date.
- `quoted` / `singleLine` move out of `markdown.formatter.ts` into a shared formatter helper.

### 6.2 Filename
- `transcriptFilename`'s cleaning logic moves to `@mnemosyne/shared` as `noteBasename( title )` (same rules: strips `/ \ : * ? " < > | # ^ [ ]` and control characters, collapses whitespace, max 100 chars, `Untitled` fallback).
- The server's `transcriptFilename` and the web's filename preview both call it, so they cannot drift.

### 6.3 Writer (`clients/vault.client.ts`, new)
- Writes to `${VAULT_PATH}/Mnemosyne/`, created if missing.
- Exclusive create (`flag: 'wx'`); on `EEXIST` retry `Title (2).md`, `Title (3).md`… Never overwrites.
- On startup, check `VAULT_PATH` exists and is writable; exit with a clear message if not (same pattern as config errors).
- Save order in `saveJob`: write the note → mark `saved` with `saved_path`, null the transcript. If the write fails, the job stays in `ready_for_review`.

## 7. Cleanup sweeper
- `startSweeper()` (new, `worker/sweeper.ts`) returns a stop function like `startWorker`; started in `server.ts`, stopped in `shutdown.ts`.
- Each tick calls `deleteExpiredJobs( now )`.
- `REVIEW_TTL_HOURS` (default 24) sets `expires_at`; `CLEANUP_INTERVAL_MINUTES` (default 15). Tests use fake timers.

## 8. API
| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/jobs` | unchanged |
| `GET` | `/api/jobs` | **new**: active jobs (in progress, `ready_for_review`, `summary_failed`), newest first → `ListJobsResponse` |
| `GET` | `/api/jobs/:id` | unchanged shape, extended `Job` (no transcript) |
| `GET` | `/api/jobs/:id/transcript` | **new**: `GetTranscriptResponse` (JSON) for the review pane |
| `GET` | `/api/jobs/:id/download?format=md\|srt\|txt` | existing; now allowed in `ready_for_review` / `summary_failed`; 409 otherwise (including after save) |
| `POST` | `/api/jobs/:id/save` | **new**: `SaveJobBody` → 200 `SaveJobResponse`; 409 unless `ready_for_review` |
| `POST` | `/api/jobs/:id/retry-summary` | **new**: 202; 409 unless `summary_failed` |
| `DELETE` | `/api/jobs/:id` | **new**: discard, 204; 409 unless `ready_for_review` / `summary_failed` |

The Download transcript button reuses the existing download endpoint, so SRT and TXT stay available too.

## 9. Web

### 9.1 Foundation (refactor, no behaviour change)
- `api/jobs.api.ts` keeps typed functions parsed with shared schemas; add the new endpoints.
- One `QueryClient`; keys `['jobs']`, `['jobs', id]`, `['jobs', id, 'transcript']`.
- React Router: `/` and `/jobs/:id`, replacing `?job=<id>` (`readJobIdFromUrl` / `writeJobIdToUrl` go). Express's existing `index.html` fallback in `web.routes.ts` already serves `/jobs/:id`.
- `useJob` becomes a `useQuery` wrapper.
- Test helper `renderWithClient` (fresh client, retries off, inside a memory router).

### 9.2 Hooks
- `useJobs()`: polls every 2 s while any job is in progress, otherwise every 30 s (expiry countdowns).
- `useJob( id )`: polls every 2 s while the status is in progress.
- `useTranscript( id )`: fetched once.
- `useSaveJob()`: waits for the server; on success invalidates `['jobs']` and navigates home with the saved path.
- `useDiscardJob()`: optimistic removal from `['jobs']`, rolled back on error.
- `useRetrySummary()`: sets the cached job to `summarizing`, then invalidates.
- `useDraft( jobId, initial )`: `{ title, tags, body }` in state, mirrored to localStorage key `mnemosyne:draft:<jobId>`; storage access in try/catch; cleared on save/discard; ignored if the job is gone.

### 9.3 Components
- **Home:** `SubmitForm` (existing; on success navigates to `/jobs/:id`) + new `JobList` (title or URL, status, "expires in Xh", link).
- **Review (`/jobs/:id`):** in-progress jobs show `JobProgress` (existing); `ready_for_review` shows `TitleField` + `FilenamePreview` (`Mnemosyne/<noteBasename>.md`, collision suffix not predicted), `TagInput` (`mnemosyne` fixed, not removable), `SummaryEditor` (textarea), `TranscriptPane`, `DownloadLinks` (existing), Save, Discard.
- **Caret sync:** when the editor's caret is on a line containing a timestamp, `TranscriptPane` scrolls to the paragraph at or before that second. The pane renders paragraphs (existing `groupParagraphs` logic, moved to shared) with an id per start second.
- `summary_failed` shows the error and **Retry summary** in place of the editor; the transcript pane stays.

## 10. Config (`config.ts`, `.env.example`, `docker-compose.yml`)
| Var | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | `.env` only |
| `VAULT_PATH` | required | container path of the vault mount, e.g. `/vault` |
| `DATA_DIR` | `${tmpdir}/mnemosyne-data` natively, `/data` in Docker | |
| `REVIEW_TTL_HOURS` | `24` | |
| `CLEANUP_INTERVAL_MINUTES` | `15` | |
| `SUMMARY_TIMEOUT_MS` | `300000` | |

Docker:
- `docker-compose.yml`: `env_file: .env` for the API key; named volume `mnemosyne-data:/data`; bind mount `${VAULT_HOST_PATH}:/vault`.
- `Dockerfile`: create `/data` owned by `node` before `USER node`, so the named volume is writable.

## 11. Tests
- **Shared:** schemas, `noteBasename`, paragraph grouping.
- **Server unit:** summary clean-up and rendering, note formatter, state transitions, the repository against `':memory:'`, vault client against a temp dir (mkdir, collisions, no overwrite), sweeper with fake timers, startup recovery, worker picking `summarizing` jobs.
- **Server routes (Supertest):** every new endpoint and its 404/409 paths, with the Claude client mocked and a temp vault.
- **Integration:** one real Claude call in `pnpm test:integration` (never in `pnpm test`).
- **Web:** hooks and components with `renderWithClient`, following the existing test setup.
- **Manual checklist** at the last checkpoint: a real 1–2 h video through to a note in the vault, plus a container restart mid-review.

## 12. Phases (detail in `tasks.md`)
1. Shared contracts: statuses, `Job` DTO, new schemas, `noteBasename`, paragraphs to shared
2. SQLite: repository swap, migrations, recovery, `allowBuilds`
3. Summarizer: Claude client, clean-up, rendering, worker integration and resume, retry
4. Vault and lifecycle: note formatter, vault client, save/discard/transcript/list endpoints, sweeper
5. Config and Docker
6. Web foundation: TanStack Query and React Router refactor
7. Web features: job list, review screen, drafts, caret sync
8. End-to-end verification

## 13. ADRs (new, drafted with this TRD)
- 0012 SQLite via better-sqlite3 (supersedes the in-memory store in 0006)
- 0013 TanStack Query and React Router (supersedes the polling and `?job=` parts of 0011)
- 0014 Summarizer: Claude API called from the server, behind one client module
- 0015 Transcript lifecycle: deleted after review; 24-hour expiry
- 0016 localStorage drafts
- 0017 Commit `docs/` and the CLAUDE.md files
- 0018 Spec-driven workflow

## 14. Open questions
None.
