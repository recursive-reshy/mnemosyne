# Tasks — Mnemosyne v0.2.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or two phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results, anything deferred, and any ADR that changes the TRD (e.g. "ADR 0019 changes TRD §8"). Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR and add its number to the task's ADR column.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–2 (shared contracts, SQLite)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Shared contracts** | | |
| 1.1 | Add `summarizing`, `ready_for_review`, `summary_failed`, `saved` to `JobStatus` (keep `done` until 3.8) | 0014, 0015 | ✅ |
| 1.2 | Extend `Job` with `title`, `summary_markdown`, `suggested_tags`, `expires_at`, `saved_path`; `toPublicJob` returns them | 0014, 0015 | ✅ |
| 1.3 | New schemas in `api.ts`: `ListJobsResponse`, `GetTranscriptResponse`, `SaveJobBody`, `SaveJobResponse` | 0008 | ✅ |
| 1.4 | Move the filename cleaning to shared as `noteBasename`; server `transcriptFilename` uses it | 0008 | ✅ |
| 1.5 | Move `groupParagraphs` to shared; the Markdown formatter imports it | 0008 | ✅ |
| **Phase 2** | **SQLite persistence** | | |
| 2.1 | Add `better-sqlite3` (+ `allowBuilds`); `openJobStore` / `closeJobStore` with `user_version` migrations and the `jobs` table | 0012 | ✅ |
| 2.2 | Re-implement the existing repository functions on SQLite; transcript stored as JSON and parsed with the shared schema; existing tests stay green | 0012 | ✅ |
| 2.3 | `DATA_DIR` in config; open the store in `server.ts`, close it in `shutdown.ts` | 0012 | ✅ |
| 2.4 | Startup recovery: `markInterruptedJobs` + `recoverInterruptedJobs` (downloading/converting/transcribing → `failed`) | 0012 | ✅ |

## Checkpoint B: Phase 3 (summarizer)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 3** | **Summarizer** | | |
| 3.1 | Config: `ANTHROPIC_API_KEY`, `SUMMARY_TIMEOUT_MS`, `REVIEW_TTL_HOURS`; `settings.ts` with `getSummaryModel()` | 0014 | ✅ |
| 3.2 | Add `@anthropic-ai/sdk`; `SummaryResult` schema; `claude.client.ts` `summarizeTranscript` (SDK mocked in tests; check structured-output API via Context7) | 0014 | ✅ |
| 3.3 | `summary.cleanup.ts`: verbatim-quote filter, timestamp bounds, tag normalization | 0014 | ✅ |
| 3.4 | `summary.formatter.ts`: render the note body, YouTube links or plain timestamps | 0014 | ✅ |
| 3.5 | Service: `completeTranscription` (→ `summarizing`, stores title), `completeSummary` (→ `ready_for_review`, sets `expires_at`), `failSummary`; `failJob` refuses the new end states | 0014, 0015 | ✅ |
| 3.6 | Worker: summarize step after transcription; `findNextRunnableJob` picks `queued` or `summarizing` | 0014 | ✅ |
| 3.7 | Worker: a `summarizing` job runs the summarize step only (resume after restart, and retries later) | 0014, 0015 | ✅ |
| 3.8 | Remove `done`: download allowed in `ready_for_review` / `summary_failed`; web shows downloads in those states | 0015 | ✅ |
| 3.9 | Integration test: one real Claude call in `pnpm test:integration` | 0007, 0014 | ✅ |

## Checkpoint C: Phases 4–5 (vault, lifecycle, Docker)
**Plan:** ✅ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Vault and lifecycle** | | |
| 4.1 | Extract `quoted` / `singleLine` to a formatter helper; `note.formatter.ts` (frontmatter + body) | 0005 | ✅ |
| 4.2 | `VAULT_PATH` in config; `vault.client.ts` `writeNote` (mkdir, exclusive create, ` (2)` suffixes); writable check at startup | 0015 | ✅ |
| 4.3 | `GET /api/jobs`: `listActiveJobs`, newest first | 0006 | ✅ |
| 4.4 | `GET /api/jobs/:id/transcript` (JSON) | 0006 | ✅ |
| 4.5 | `POST /api/jobs/:id/save`: `saveJob` writes the note, marks `saved`, nulls the transcript | 0015 | ✅ |
| 4.6 | `POST /api/jobs/:id/retry-summary`: `retrySummary` → `summarizing` | 0014, 0015 | ✅ |
| 4.7 | `DELETE /api/jobs/:id`: `discardJob` | 0015 | ✅ |
| 4.8 | Sweeper: `findExpiredJobs`, `deleteExpiredJobs`, `startSweeper` wired into `server.ts` / `shutdown.ts`; `CLEANUP_INTERVAL_MINUTES` | 0015 | ✅ |
| **Phase 5** | **Config and Docker** | | |
| 5.1 | `.env.example`, compose (`env_file`, `mnemosyne-data:/data`, `${VAULT_HOST_PATH}:/vault`), Dockerfile `/data` owned by `node`; verify with a build and a healthy container | 0004, 0012 | ✅ |
| 5.2 | Update `apps/server/CLAUDE.md` (environment, repositories, worker flow) and the README | 0012, 0014 | ✅ |

## Checkpoint D: Phase 6 (web foundation)
**Plan:** ✅ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Web foundation (refactor, no behaviour change)** | | |
| 6.1 | Add `@tanstack/react-query`; `QueryClientProvider`; `renderWithClient`; `useJob` becomes a `useQuery` wrapper | 0013 | ✅ |
| 6.2 | Add `react-router`; `/` and `/jobs/:id` replace `?job=<id>`; submitting navigates to the job | 0013 | ✅ |
| 6.3 | API client functions for list, transcript, save, retry and discard | 0013 | ✅ |

## Checkpoint E: Phase 7 (web features)
**Plan:** ✅ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Web features** | | |
| 7.1 | `useJobs` + `JobList` on home: status, expiry countdown, link to review | 0013, 0015 | ✅ |
| 7.2 | Review page shell: in-progress, `ready_for_review` and `summary_failed` layouts | 0013 | ✅ |
| 7.3 | `TitleField` + `FilenamePreview` (shared `noteBasename`) | 0013 | ✅ |
| 7.4 | `TagInput` (`mnemosyne` fixed) | 0013 | ✅ |
| 7.5 | `SummaryEditor` + `TranscriptPane` (`useTranscript`) | 0013 | ✅ |
| 7.6 | `useDraft`: localStorage drafts, cleared on save/discard | 0016 | ✅ |
| 7.7 | Save: `useSaveJob`, back to home with the saved path | 0013, 0015 | ✅ |
| 7.8 | Discard (optimistic) and Retry summary | 0013, 0015 | ⬜ |
| 7.9 | Caret sync: caret on a timestamp line scrolls the transcript | 0013 | ⬜ |
| 7.10 | Styling pass for home and review screens | 0011 | ⬜ |

## Checkpoint F: Phase 8 (verification)
**Plan:** ⬜ [`plans/checkpoint-f.md`](plans/checkpoint-f.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **End-to-end** | | |
| 8.1 | Manual checklist with Naresh: real 1–2 h video → note in vault; restart mid-review; filename collision; discard; expiry with a short TTL | — | ⬜ |
| 8.2 | Version bump to 0.2.0 across `package.json` files; README | — | ⬜ |

---

## Log
- 1.1 ✅ Added `summarizing`, `ready_for_review`, `summary_failed`, `saved` to `JobStatus` (`done` kept); `JobProgress` got messages for them so web typechecks (agreed with Naresh).
- 1.2 ✅ `Job` extended with `title`, `summary_markdown`, `suggested_tags`, `expires_at`, `saved_path`; `toPublicJob` returns them. Test literals/fixtures updated (shared api, server service and repository, web fixture); the `queueJob` exact-shape assertion gained the new fields. Also fixed a pre-existing lint error in `pipeline.integration.test.ts` (`afterAll` now awaits `stopWorker`).
- 1.3 ✅ Added `ListJobsResponse`, `GetTranscriptResponse`, `SaveJobBody` (title trimmed, non-empty), `SaveJobResponse` to shared `api.ts`.
- 1.4 ✅ `noteBasename( title, fallback = 'Untitled' )` in shared; server `transcriptFilename` calls it with fallback `transcript`, so download names are unchanged.
- 1.5 ✅ `groupParagraphs`, `cleanText` and `Paragraph` moved to shared with their tests; the three formatters import them from `@mnemosyne/shared`.
- 2.1 ✅ Added `better-sqlite3` (+ types, `allowBuilds`); `openJobStore` / `closeJobStore` with `user_version` migrations and the `jobs` table, WAL mode. Functions still run on the Map until 2.2.
- 2.2 ✅ Repository functions re-implemented on SQLite (same signatures); transcript and tags stored as JSON and parsed with the shared schemas on read; a Vitest setup file opens `:memory:` per test (also wired into the integration config) so existing tests are untouched.
- 2.3 ✅ `DATA_DIR` in config (default `<tmp>/mnemosyne-data`); `server.ts` opens `mnemosyne.db` there, `shutdown.ts` closes the store after the worker and server stop (not on timeout). Existing config exact-shape test and the shutdown `build` helper gained the new field. Docker volume wiring is 5.1.
- 2.4 ✅ `markInterruptedJobs` (repository) and `recoverInterruptedJobs` (service); `server.ts` runs it after opening the store and before starting the worker.
- 3.1 ✅ Config: required `ANTHROPIC_API_KEY`, `SUMMARY_TIMEOUT_MS` (300000), `REVIEW_TTL_HOURS` (24); `settings.ts` `getSummaryModel()`; Vitest sets a test key. `config.test.ts` rewritten around the new required key and fields.
- 3.2 ✅ Added `@anthropic-ai/sdk` (zod 4 works with `zodOutputFormat`); `claude.client.ts` `summarizeTranscript` via `messages.parse`, `SummaryResult` schema; max_tokens 16000, effort medium, one retry; refusal / max_tokens / unparsable output throw.
- 3.3 ✅ `cleanSummary`: verbatim-quote filter (whitespace-normalised, case-sensitive), timestamp bounds, tag normalization (cap 5, drops `mnemosyne`).
- 3.4 ✅ `formatSummary( summary, source )`: Summary / Key points / Notable quotes, YouTube links or plain timestamps; empty key points and quotes sections are omitted (agreed in the plan).
- 3.5 ✅ Service: `completeTranscription`, `completeSummary`, `failSummary`, `getTranscript`; `failJob` refuses `ready_for_review`, `summary_failed`, `saved`. `completeJob` stays until 3.8.
- 3.6 ✅ `findNextRunnableJob` (queued or summarizing) replaces `findNextQueuedJob` end to end; `summarizeJob` (client → cleanup → format → `completeSummary`, or `failSummary`); `runJob` ends in `completeTranscription` then summarizes after audio cleanup. Existing runJob assertions expecting `done` now expect `summarizing`; the renamed tests keep their cases.
- 3.7 ✅ `runJob` on a `summarizing` job runs only `summarizeJob` (no clients, no audio folder); queued jobs still run the full pipeline.
- 3.8 ✅ `done` and `completeJob` removed; downloads allowed in `ready_for_review` / `summary_failed` (409 otherwise, incl. `saved`); web: `useJob` stops polling on the four end states, `JobProgress` has Summarizing and Ready for review stages, `App` shows downloads in review states. Tests that used `done` now use `ready_for_review`; `JobProgress` stage-count assertions went from 5 to 6.
- 3.9 ✅ `claude.integration.test.ts` (one real call; skipped when `ANTHROPIC_API_KEY` is unset) and the integration config loads `.env`. Skipped on this run: no key was available, so it has not hit the real API yet.
- 4.1 ✅ `quoted` / `singleLine` moved to `formatters/frontmatter.ts`; `formatNote` renders the vault note (frontmatter + body); tags sanitized with the shared normalization, `mnemosyne` first.
- 4.2 ✅ Required `VAULT_PATH`; `vault.client.ts` `writeNote` (mkdir, exclusive create, (2)/(3) suffixes) and `assertVaultWritable`, called at startup before the store opens.
- 4.3 ✅ `GET /api/jobs`: `listActiveJobs` (everything except `failed` and `saved`), newest first.
- 4.4 ✅ `GET /api/jobs/:id/transcript` via `findTranscript` (same downloadable-status rule as downloads; `renderTranscript` now uses it).
- 4.5 ✅ `POST /api/jobs/:id/save`: `saveJob` formats the note, writes it to the vault, then marks `saved` (path, edited title, transcript nulled, expiry cleared); a failed write leaves the job in review.
- 4.6 ✅ `POST /api/jobs/:id/retry-summary`: `retrySummary` (summary_failed → summarizing, clears error and expiry), `202 { job }`; the worker needs no change.
- 4.7 ✅ `DELETE /api/jobs/:id`: `deleteJob` (repository) and `discardJob`; 204, 404 unknown, 409 unless `ready_for_review` / `summary_failed`.
- 4.8 ✅ Sweeper: `findExpiredJobs`, `deleteExpiredJobs`, `startSweeper` (runs at start, then every `CLEANUP_INTERVAL_MINUTES`), wired into `server.ts` / `shutdown.ts` (stopped first). Shutdown test `build()` helper gained `stopSweeper`.
- 5.1 ✅ Root `.env.example`; compose gets `env_file: .env`, `mnemosyne-data:/data` and `${VAULT_HOST_PATH}:/vault`; Dockerfile sets `DATA_DIR`/`VAULT_PATH`, owns `/data` as `node`, and installs `python3 make g++` in the build stage (better-sqlite3 had no prebuilt binary). Verified with `docker build`, then the image run on a spare port with a throwaway volume and vault: health ok, DB created in `/data`, vault writable, DB survives a restart. `docker compose up` itself was not run, to leave the running 0.1.0 container on :3100 alone; `docker compose config` parsed the file.
- 5.2 ✅ `apps/server/CLAUDE.md` (environment, folder structure, layers, worker flow), README (flow, config table, vault, troubleshooting) and the root `CLAUDE.md` architecture paragraph brought up to date.
- 6.1 ✅ `@tanstack/react-query`; `createQueryClient`, `QueryClientProvider` in `main.tsx`, `jobKeys`, `renderWithClient` / `renderHookWithClient`; `useJob` is a `useQuery` wrapper with the same `{ job, error }` result. Hook suite kept (render helper swapped, assertions unchanged) plus two sharing tests; the test setup uses a microtask scheduler for TanStack so fake timers work.
- 6.2 ✅ `react-router`: `/` → `HomePage`, `/jobs/:id` → `JobPage` (invalid id and unknown paths redirect to `/`); submitting and retrying navigate to the new job. `App.test.tsx` rewritten around routes, with the scenarios split into `HomePage.test.tsx` and `JobPage.test.tsx`; `renderWithClient` takes a `route` and returns `location()`.
- 6.3 ✅ `listJobs`, `getTranscript`, `saveJob` (returns the saved path), `retrySummary`, `discardJob` (204, no body) in `jobs.api.ts`; the shared `send` helper holds the fetch and error handling.
- 7.1 ✅ `useJobs` (2 s while anything is in progress, else 30 s; returns `updatedAt` so the countdown needs no impure render), `formatExpiry`, `JobList` on the home page.
- 7.2 ✅ `ReviewScreen` shell (title, Summary and Transcript regions, downloads; failure reason for `summary_failed`); `JobPage` picks progress, review or saved layout by status.
- 7.3 ✅ `TitleField` and `FilenamePreview` (shared `noteBasename`) in the review screen; the title starts as the job title.
- 7.4 ✅ `normalizeTag` moved to shared (server imports it; cleanup tests unchanged); `TagInput` with the fixed `mnemosyne` chip, removable chips, Enter / comma / blur to add. The tags sent on save will be the editable ones; the server prepends `mnemosyne`.
- 7.5 ✅ `formatClock` moved to shared (server formatters import it; its tests moved); `useTranscript` (fetched once), `SummaryEditor` (raw Markdown textarea), `TranscriptPane` (paragraph ids `transcript-<second>`); the pane shows in the review and failed-summary layouts. The 7.2 `JobPage` test now reads the Summary textarea value.
- 7.6 ✅ `useDraft` (localStorage `mnemosyne:draft:<jobId>`, validated on read, all access in try/catch, written on edits only); `clearDraft`; `useJob` drops the draft when the job is gone (404); the review screen binds title, tags and body to the draft. No `zod` added to the web app: the draft is checked with a small type guard.
- 7.7 ✅ `useSaveJob` (waits for the server, then clears the draft and invalidates `[jobs]`); Save to vault button (busy, disabled for a blank title, absent when the summary failed); `JobPage` navigates home with `{ savedPath }` and `HomePage` shows "Saved to …". Tags sent are the editable ones.
