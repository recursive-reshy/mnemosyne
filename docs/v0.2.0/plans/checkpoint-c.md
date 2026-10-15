# Checkpoint C plan: Phases 4–5 (vault, lifecycle, Docker)

## Context
After Checkpoint B a job ends in `ready_for_review` or `summary_failed` with its transcript kept. Checkpoint C adds what happens next: write the reviewed note into the Obsidian vault, discard, retry a failed summary, list active jobs, serve the transcript to the review pane, and delete expired jobs on a timer. Phase 5 then wires the new env vars, the data volume and the vault mount into Docker and brings the docs up to date. ADRs: 0004, 0005, 0006, 0012, 0014, 0015. Test-first per task; one commit each, pushed. After each task run `test`, `lint`, `typecheck` in every touched folder (`apps/server`, plus `packages/shared` or `apps/web` if touched).

## Points to confirm
1. **`VAULT_PATH` is required** (TRD §10) and checked at startup (exists and writable, else a clear message and exit 1). Dev needs it in `apps/server/.env` (point it at any folder); Vitest sets `VAULT_PATH` in `test.env`.
2. **Retry response body.** TRD §8 says `202` without a body. Plan: `202` with `GetJobResponse` (`{ job }`, an existing schema), so the web's `useRetrySummary` can set the cached job to `summarizing` without a second request. No new contract.
3. **Tags in the note are sanitized server-side** with the same normalization as suggested tags (lowercase, hyphens, invalid characters stripped, deduped), with `mnemosyne` always first. The user can type anything in the tag input, and a stray comma or bracket would break the YAML flow list. Side effect: nested Obsidian tags like `a/b` become `ab`.
4. **`created:` is the save date in UTC** (`YYYY-MM-DD`). The container runs in UTC, so this can be one day off for an evening save in a time zone behind UTC.
5. **`GET /api/jobs` excludes `failed` jobs** (TRD §8 lists in-progress, `ready_for_review`, `summary_failed`). A hard-failed job is only visible through its own URL.
6. **`env_file: .env`** in compose, as the TRD says. Compose then errors if the root `.env` is missing, which is acceptable because the key is required anyway. The same file also feeds `${VAULT_HOST_PATH}` interpolation, and `VAULT_HOST_PATH` will therefore also reach the container (harmless).
7. **Native build in Docker.** If `better-sqlite3` has no prebuilt linux-arm64 binary, the build stage needs `python3 make g++` (the TRD §2 allows it). I'll find out in 5.1 and add them only if the build needs them.

## Phase 4: vault and lifecycle

### 4.1 Frontmatter helpers and note formatter
- Files: new `src/formatters/frontmatter.ts` + `.test.ts` (`quoted`, `singleLine`, moved from `markdown.formatter.ts`), `markdown.formatter.ts`, new `note.formatter.ts` + `.test.ts`; `summary.cleanup.ts` exports `normalizeTag`.
- Tests first: helper tests for escaping (`\`, `"`, newlines); `formatNote( { title, tags, body, meta, created } )` exact string:
  ```
  ---
  title: "…"
  source: "…"
  channel: "…"
  duration: "1:42:10"
  created: 2026-10-15
  tags: [mnemosyne, a, b]
  ---

  <body>
  ```
  with a trailing newline. Cases: quotes and newlines in the title, `mnemosyne` kept first and not duplicated, tags normalized and deduped, empty tags give `[mnemosyne]`, body trimmed. Existing `markdown.formatter` tests are the regression guard.
- Code: move the two helpers; `formatNote`.

### 4.2 `VAULT_PATH` and the vault client
- Files: `config.ts` + test (required `VAULT_PATH`, `vaultPath`), `vitest.config.ts` env, `.env.example`, `src/clients/vault.client.ts` + `.test.ts`, `server.ts`, `apps/server/CLAUDE.md` Environment.
- Tests first (`vault.client`, temp directory, real fs): `writeNote( vaultPath, title, content )` creates `Mnemosyne/` if missing and writes `Mnemosyne/<noteBasename( title )>.md`, returning that vault-relative path; a clash gives ` (2)`, ` (3)`; never overwrites (the first file's content is intact); an `Untitled` fallback; a non-clash error (read-only folder) propagates; `assertVaultWritable( vaultPath )` passes for a writable folder and throws a readable message for a missing path, a file, or a read-only folder.
- Code: exclusive create (`flag: 'wx'`) with a bounded retry loop; `server.ts` calls `assertVaultWritable` before opening the store and exits 1 with the message (same pattern as config errors). Config tests get the new required var like in 3.1.

### 4.3 `GET /api/jobs`
- Files: `jobStore.repository.ts` + test (`listActiveJobs`), `jobs.service.ts` + test (`listJobs`), `jobs.controller.ts`, `jobs.routes.ts`, `jobs.routes.test.ts`.
- Tests first: repository returns queued, downloading, converting, transcribing, summarizing, ready_for_review and summary_failed jobs, newest first (stable on equal timestamps), excluding `failed` and `saved`; route returns `200 { jobs }` parsing as `ListJobsResponse`, no transcript property, empty list when none.
- Code: SQL `ORDER BY created_at DESC, rowid DESC`; service maps through `toPublicJob`.

### 4.4 `GET /api/jobs/:id/transcript`
- Files: `jobs.service.ts` + test (`findTranscript`), controller, routes, route test.
- Tests first: `200 { transcript }` parsing as `GetTranscriptResponse` in `ready_for_review` and `summary_failed`; `404` for an unknown or non-UUID id; `409 Transcript not ready` for queued, summarizing, failed and saved jobs.
- Code: `findTranscript` applies the same downloadable-status rule as `renderTranscript` (shared constant), unlike the worker-only `getTranscript`.

### 4.5 `POST /api/jobs/:id/save`
- Files: `jobs.service.ts` + test (`saveJob`), controller, routes, route test; `.env`-free (vault client mocked in service tests, real temp vault in the route test).
- Tests first:
  - service: writes the note (formatted with the stored transcript meta, edited title/tags/body and the save date) via the vault client, then marks `saved` with `saved_path`, nulls the transcript, clears `expires_at`, keeps the edited title; 409 unless `ready_for_review` (incl. `summary_failed`, `saved`, `summarizing`); if `writeNote` rejects, the job stays `ready_for_review` with its transcript and the error propagates.
  - route: `200 { saved_path }`; `400` for a blank title or bad body; `404`; `409`; a second save of the same title in the vault gives `… (2).md` (collision across jobs); the file's content matches the note.
- Code: `saveJob` (write first, then update, per TRD §6.3); `SaveJobBody` / `SaveJobResponse` from shared.

### 4.6 `POST /api/jobs/:id/retry-summary`
- Files: `jobs.service.ts` + test (`retrySummary`), controller, routes, route test, `worker` test.
- Tests first: `summary_failed → summarizing`, clears `error` and `expires_at`, keeps transcript; `202 { job }`; `404`; `409` from any other status; a worker pass picks the job up and ends `ready_for_review` (client mocked).
- Code: `retrySummary`; no worker change needed (3.7).

### 4.7 `DELETE /api/jobs/:id`
- Files: `jobStore.repository.ts` + test (`deleteJob`), `jobs.service.ts` + test (`discardJob`), controller, routes, route test.
- Tests first: `204` and the job is gone (`GET` returns 404, list excludes it) from `ready_for_review` and `summary_failed`; `404` unknown; `409` from queued, in-progress, `failed`, `saved`.
- Code: `deleteJob` returns whether a row was removed; `discardJob` checks status first.

### 4.8 Sweeper
- Files: `jobStore.repository.ts` + test (`findExpiredJobs( now )`), `jobs.service.ts` + test (`deleteExpiredJobs`), `src/worker/sweeper.ts` + `.test.ts`, `config.ts` + test (`CLEANUP_INTERVAL_MINUTES`, default 15, positive), `server.ts`, `shutdown.ts` + test, `.env.example`, `apps/server/CLAUDE.md`.
- Tests first: repository returns only `ready_for_review` / `summary_failed` jobs whose `expires_at <= now` (not other statuses, not null expiry); `deleteExpiredJobs` removes them and returns the count; the sweeper (fake timers) runs once at start, then every interval, logs a count when non-zero, survives a thrown error, and the returned stop function ends the timer; shutdown calls `stopSweeper` first.
- Existing shutdown tests' `build()` helper gains the new option (fixture edit, like `closeStore` in A).
- Code: `startSweeper(): () => void`; wired in `server.ts` and `shutdown.ts`.

## Phase 5: config and Docker

### 5.1 Compose, Dockerfile, env example
- Files: root `.env.example` (`ANTHROPIC_API_KEY`, `VAULT_HOST_PATH`, `WHISPER_MODEL`), `docker-compose.yml` (`env_file: .env`, `mnemosyne-data:/data`, `${VAULT_HOST_PATH:?…}:/vault`, named volume), `Dockerfile` (`ENV DATA_DIR=/data VAULT_PATH=/vault`, `/data` created and owned by `node` before `USER node`; `python3 make g++` only if the build needs them), `.dockerignore` unchanged.
- No unit test; verification is the build plus a healthy container (below). Done and ticked only when `docker compose up -d --build` shows the container healthy with the volume and mount.

### 5.2 Docs
- Files: `apps/server/CLAUDE.md` (Environment: `VAULT_PATH`, `DATA_DIR` in Docker, `CLEANUP_INTERVAL_MINUTES`; folder structure with `settings.ts`, `claude.client.ts`, `vault.client.ts`, `summarizeJob.ts`, `sweeper.ts`; repositories now SQLite per ADR 0012; worker flow; errors list), `README.md` (how it works, flow with review and save, config table, Docker volume and vault mount, stopping, troubleshooting: no more "kept in memory"), root `CLAUDE.md` Architecture paragraph (summary and vault).
- No PRD/TRD edits.

## Verification
- Per task: new tests fail first for the stated reason, then pass; full `test`/`lint`/`typecheck` in each touched folder.
- End of checkpoint: root `pnpm test`, `lint`, `typecheck`, `build`; `docker compose up -d --build` then `docker compose ps` shows healthy and `curl localhost:3100/api/health` is ok (needs Docker Desktop and a root `.env` with a vault path; if Docker or a key is unavailable, I'll say so and leave 5.1 unticked rather than guess); a local run with a temp `VAULT_PATH`, a job seeded through the repository, then `save` → file in `Mnemosyne/`, a second save → `(2)`, `DELETE`, and a short-TTL sweep.
- Report: tasks with commit hashes, per-folder results, existing tests changed, ADRs (none expected), and anything not verified.
