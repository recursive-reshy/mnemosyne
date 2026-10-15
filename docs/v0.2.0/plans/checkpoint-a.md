# Checkpoint A plan: Phases 1–2 (shared contracts, SQLite)

## Context
v0.2.0 needs a richer job model (summary, tags, expiry, saved path) and a job store that survives restarts. Checkpoint A lays both foundations: new shared contracts (Phase 1) and the in-memory `Map` replaced by SQLite behind the same repository API (Phase 2). No behaviour changes visible to users; the summarizer and vault come in B and C. ADRs: 0008, 0012, 0014, 0015. Test-first for every task (ADR 0007); one commit per task, pushed.

Run after each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in every folder touched (`packages/shared`, `apps/server`, and `apps/web` when its fixture changes).

## Points to confirm
1. **`noteBasename` fallback.** TRD §6.2 says the fallback is `Untitled`, but `filename.test.ts` requires `transcriptFilename( '???' )` → `transcript.md`, and existing tests must stay green. Plan: `noteBasename( title, fallback = 'Untitled' )`; `transcriptFilename` passes `'transcript'`. Transcript download names don't change.
2. **Web fixture.** Task 1.2 makes the new `Job` fields required, so `apps/web/src/test-support/job.fixture.ts` needs the new fields (fixture only; no web test files change). Web tests, lint and typecheck run for that commit.
3. **`cleanText` moves with `groupParagraphs`** (task 1.5), because `groupParagraphs` depends on it and `srt.formatter.ts` also uses it. Both become shared exports; `srt.formatter.ts` imports from `@mnemosyne/shared`.

## Phase 1: shared contracts

### 1.1 New statuses
- Files: `packages/shared/src/job.ts`, `job.test.ts`.
- Test first: extend the `it.each` list in `JobStatus` with `summarizing`, `ready_for_review`, `summary_failed`, `saved`. (Red: those values are rejected.)
- Code: add the four values to the enum; keep `done`.
- Server/web typecheck should stay green (they only widen).

### 1.2 Extend `Job`
- Files: `packages/shared/src/job.ts`, `job.test.ts`; `apps/server/src/services/jobs.service.ts` (+ `.test.ts`); `apps/server/src/repositories/jobStore.repository.ts` (`StoredJob` extends `Job`); `apps/web/src/test-support/job.fixture.ts`.
- Tests first:
  - shared: `Job` accepts and requires `title`, `summary_markdown`, `suggested_tags`, `expires_at`, `saved_path` (nullable string fields; tags default-less array); rejects a missing `suggested_tags`.
  - server service: `toPublicJob` (via `queueJob` / `findJob`) returns the new fields with their defaults (`null`, `[]`); a stored job with values returns them (use `updateJob` to set).
- Code: add fields to `Job`; `queueJob` initialises them; `toPublicJob` maps them. `toPublicJob` stays in the service and strips `transcript`.
- Existing job literals in server tests that build `Job`/`StoredJob` by hand get the new fields only if typecheck demands it (test fixtures, not assertions).

### 1.3 New API schemas
- Files: `packages/shared/src/api.ts`, `api.test.ts`.
- Tests first: `ListJobsResponse { jobs: Job[] }`, `GetTranscriptResponse { transcript }`, `SaveJobBody { title, tags, body }` (title non-empty, tags string array, body string), `SaveJobResponse { saved_path }`; valid and invalid cases each.
- Code: the four schemas plus inferred types.

### 1.4 `noteBasename` to shared
- Files: new `packages/shared/src/filename.ts` + `filename.test.ts`; export from `index.ts`; `apps/server/src/formatters/filename.ts`.
- Tests first: move the cleaning cases from the server's `filename.test.ts` into shared as `noteBasename` tests (unsafe chars, whitespace, non-English, trailing dots, 100-char cut, surrogate pair), plus `Untitled` default fallback and a custom fallback. The server test file is left untouched and must stay green.
- Code: move the cleaning logic; `transcriptFilename` becomes `` `${ noteBasename( title, 'transcript' ) }.${ format }` ``.

### 1.5 `groupParagraphs` to shared
- Files: new `packages/shared/src/paragraphs.ts` + `paragraphs.test.ts`; `index.ts`; delete `apps/server/src/formatters/paragraphs.ts` and its test; update imports in `markdown.formatter.ts`, `txt.formatter.ts`, `srt.formatter.ts`.
- Tests first: copy `paragraphs.test.ts` to shared (red: module missing), then delete the server copy in the same commit as the move (the tests move, they aren't weakened).
- Code: move `Paragraph`, `cleanText`, `groupParagraphs` unchanged. Formatter tests stay green unchanged.

## Phase 2: SQLite persistence

### 2.1 Store open/close and migrations
- Files: `apps/server/package.json` (+ `better-sqlite3`, `@types/better-sqlite3`), `pnpm-workspace.yaml` (`better-sqlite3: true` under `allowBuilds`), `jobStore.repository.ts`, `jobStore.repository.test.ts`.
- Tests first (on `':memory:'`): `openJobStore` creates the `jobs` table with the §4.2 columns; `PRAGMA user_version` equals the number of migrations; opening again does not re-run migrations; `closeJobStore` closes; a file DB gets WAL mode (temp dir); calling a repo function before open throws a clear error.
- Code: migrations as an ordered array of SQL strings; `openJobStore( path )` (closes any open store first, sets WAL, runs pending migrations in a transaction); `closeJobStore()`.

### 2.2 Repository functions on SQLite
- Files: `jobStore.repository.ts`; new `apps/server/src/test-support/jobStore.setup.ts` and `vitest.config.ts` `setupFiles` (opens `':memory:'` before each test, closes after) so existing service/route/worker tests stay green without edits.
- Tests first: the existing repository tests are the spec (insert, find, update, duplicate id throws, `findNextQueuedJob` oldest first, `clearJobs`). Add: transcript round-trips as JSON through the shared `Transcript` schema; `suggested_tags` round-trips; `updateJob` with `transcript: null` stores NULL; a corrupt transcript JSON throws on read.
- Code: `insertJob`, `findJobById`, `updateJob`, `findNextQueuedJob`, `clearJobs` on prepared statements; `StoredJob` parsed with `Job`/`Transcript` on read. Same signatures; services untouched. `findNextRunnableJob` and the other new functions arrive with the tasks that need them (3.6, 4.x, 2.4).

### 2.3 `DATA_DIR`, startup and shutdown wiring
- Files: `config.ts`, `config.test.ts`, `server.ts`, `shutdown.ts`, `shutdown.test.ts`, `.env.example`.
- Tests first: config default is `${tmpdir}/mnemosyne-data`, an explicit `DATA_DIR` is used, empty string counts as unset; `createShutdown` calls an injected `closeStore` after the server and worker have stopped, and still exits 0; if `closeStore` throws, exit 1.
- Code: `dataDir` in config; `server.ts` creates the directory and calls `openJobStore( join( dataDir, 'mnemosyne.db' ) )` before `startWorker()`; `shutdown.ts` takes `closeStore` and awaits it after stop. Update the stale "Jobs live in memory" comment in `server.ts`.

### 2.4 Startup recovery
- Files: `jobStore.repository.ts` (+ test), `jobs.service.ts` (+ test), `server.ts`.
- Tests first:
  - repository `markInterruptedJobs( message, now )`: `downloading` / `converting` / `transcribing` → `failed` with `error`, `updated_at` set; `queued`, `summarizing`, `ready_for_review`, `summary_failed`, `saved` untouched; returns the count.
  - service `recoverInterruptedJobs()` sets `error: 'Interrupted by restart'` and returns the count.
- Code: both functions; `server.ts` calls `recoverInterruptedJobs()` after `openJobStore` and before `startWorker()`, logging the count when non-zero.
- Worker stays untouched here: it already ignores non-`queued` jobs.

## Docs touched in this checkpoint
- `tasks.md`: tick Status and add a log line per task; Plan cell ✅ on approval (plan saved to `docs/v0.2.0/plans/checkpoint-a.md`).
- `apps/server/CLAUDE.md`: not changed here; task 5.2 rewrites the repository and environment sections. (Task 2.3 adds `DATA_DIR` to its Environment list in the same commit, since CLAUDE.md must match the code.)

## Verification
- Per task: the task's new tests fail first for the stated reason, then pass; full `pnpm test`, `pnpm lint`, `pnpm typecheck` in `packages/shared` and `apps/server` (and `apps/web` for 1.2).
- End of checkpoint: `pnpm build` at the root; start the server natively with a temp `DATA_DIR`, submit a job, restart, and confirm the job row is still returned by `GET /api/jobs/:id`.
- Report: tasks with commit hashes, results per folder, ADRs (none expected; note that ADR 0012 supersedes the in-memory store described in ADR 0006), and anything deferred.
