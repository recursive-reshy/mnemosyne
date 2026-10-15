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
| 2.2 | Re-implement the existing repository functions on SQLite; transcript stored as JSON and parsed with the shared schema; existing tests stay green | 0012 | ⬜ |
| 2.3 | `DATA_DIR` in config; open the store in `server.ts`, close it in `shutdown.ts` | 0012 | ⬜ |
| 2.4 | Startup recovery: `markInterruptedJobs` + `recoverInterruptedJobs` (downloading/converting/transcribing → `failed`) | 0012 | ⬜ |

## Checkpoint B: Phase 3 (summarizer)
**Plan:** ⬜ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 3** | **Summarizer** | | |
| 3.1 | Config: `ANTHROPIC_API_KEY`, `SUMMARY_TIMEOUT_MS`, `REVIEW_TTL_HOURS`; `settings.ts` with `getSummaryModel()` | 0014 | ⬜ |
| 3.2 | Add `@anthropic-ai/sdk`; `SummaryResult` schema; `claude.client.ts` `summarizeTranscript` (SDK mocked in tests; check structured-output API via Context7) | 0014 | ⬜ |
| 3.3 | `summary.cleanup.ts`: verbatim-quote filter, timestamp bounds, tag normalization | 0014 | ⬜ |
| 3.4 | `summary.formatter.ts`: render the note body, YouTube links or plain timestamps | 0014 | ⬜ |
| 3.5 | Service: `completeTranscription` (→ `summarizing`, stores title), `completeSummary` (→ `ready_for_review`, sets `expires_at`), `failSummary`; `failJob` refuses the new end states | 0014, 0015 | ⬜ |
| 3.6 | Worker: summarize step after transcription; `findNextRunnableJob` picks `queued` or `summarizing` | 0014 | ⬜ |
| 3.7 | Worker: a `summarizing` job runs the summarize step only (resume after restart, and retries later) | 0014, 0015 | ⬜ |
| 3.8 | Remove `done`: download allowed in `ready_for_review` / `summary_failed`; web shows downloads in those states | 0015 | ⬜ |
| 3.9 | Integration test: one real Claude call in `pnpm test:integration` | 0007, 0014 | ⬜ |

## Checkpoint C: Phases 4–5 (vault, lifecycle, Docker)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Vault and lifecycle** | | |
| 4.1 | Extract `quoted` / `singleLine` to a formatter helper; `note.formatter.ts` (frontmatter + body) | 0005 | ⬜ |
| 4.2 | `VAULT_PATH` in config; `vault.client.ts` `writeNote` (mkdir, exclusive create, ` (2)` suffixes); writable check at startup | 0015 | ⬜ |
| 4.3 | `GET /api/jobs`: `listActiveJobs`, newest first | 0006 | ⬜ |
| 4.4 | `GET /api/jobs/:id/transcript` (JSON) | 0006 | ⬜ |
| 4.5 | `POST /api/jobs/:id/save`: `saveJob` writes the note, marks `saved`, nulls the transcript | 0015 | ⬜ |
| 4.6 | `POST /api/jobs/:id/retry-summary`: `retrySummary` → `summarizing` | 0014, 0015 | ⬜ |
| 4.7 | `DELETE /api/jobs/:id`: `discardJob` | 0015 | ⬜ |
| 4.8 | Sweeper: `findExpiredJobs`, `deleteExpiredJobs`, `startSweeper` wired into `server.ts` / `shutdown.ts`; `CLEANUP_INTERVAL_MINUTES` | 0015 | ⬜ |
| **Phase 5** | **Config and Docker** | | |
| 5.1 | `.env.example`, compose (`env_file`, `mnemosyne-data:/data`, `${VAULT_HOST_PATH}:/vault`), Dockerfile `/data` owned by `node`; verify with a build and a healthy container | 0004, 0012 | ⬜ |
| 5.2 | Update `apps/server/CLAUDE.md` (environment, repositories, worker flow) and the README | 0012, 0014 | ⬜ |

## Checkpoint D: Phase 6 (web foundation)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Web foundation (refactor, no behaviour change)** | | |
| 6.1 | Add `@tanstack/react-query`; `QueryClientProvider`; `renderWithClient`; `useJob` becomes a `useQuery` wrapper | 0013 | ⬜ |
| 6.2 | Add `react-router`; `/` and `/jobs/:id` replace `?job=<id>`; submitting navigates to the job | 0013 | ⬜ |
| 6.3 | API client functions for list, transcript, save, retry and discard | 0013 | ⬜ |

## Checkpoint E: Phase 7 (web features)
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Web features** | | |
| 7.1 | `useJobs` + `JobList` on home: status, expiry countdown, link to review | 0013, 0015 | ⬜ |
| 7.2 | Review page shell: in-progress, `ready_for_review` and `summary_failed` layouts | 0013 | ⬜ |
| 7.3 | `TitleField` + `FilenamePreview` (shared `noteBasename`) | 0013 | ⬜ |
| 7.4 | `TagInput` (`mnemosyne` fixed) | 0013 | ⬜ |
| 7.5 | `SummaryEditor` + `TranscriptPane` (`useTranscript`) | 0013 | ⬜ |
| 7.6 | `useDraft`: localStorage drafts, cleared on save/discard | 0016 | ⬜ |
| 7.7 | Save: `useSaveJob`, back to home with the saved path | 0013, 0015 | ⬜ |
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
