# Tasks — Mnemosyne v0.5.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package (and `test:browser` for web from checkpoint B on), browser screenshots (light and dark) of any screens touched, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR and add its number to the task's ADR column.
- **Dependencies:** only the ones in TRD §1, each added by the task that first uses it. Check its real API against the TRD first; if it differs in a way that changes the design, stop and ask.
- **No test touches the network.** Use fixtures and local servers on port 0.
- Existing tests pass unchanged, except the changes TRD §9 allows; list each one in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–4 (kick-off, contracts, data, adapter refactor)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Set ADRs 0030–0033 to Accepted (Status lines and the `docs/README.md` index, already listed as Proposed); mark 0014 and 0015 as amended by 0030 in the index and their files | 0030–0033 | ✅ |
| **Phase 2** | **Shared contracts** | | |
| 2.1 | `source.ts` (`SourceType`, `VideoSource`, `ArticleMeta`, `ArticleSource`, `SourceDocument`, `ARTICLE_LIMITS`) and `detectSourceType.ts`, exported from `index.ts`, with tests (TRD §2.1–2.2) | 0030 | ✅ |
| 2.2 | `NoteProperties` with optional video and article keys, key order, `lockedPropertiesFor`, `applyLockedProperties` removing absent locked keys; existing video notes byte-identical (TRD §2.3) | 0030 | ✅ |
| 2.3 | `JobStatus` `fetching`; `Job` `source_type`, `feed_id`, `feed_name`; `CreateJobBody` `source_type?`, `text?`, `title?` with the refinement; `SubmitPastedTextBody`; `GetSourceResponse` replaces `GetTranscriptResponse`; `Settings` `feed_check_interval_minutes`; `locked_instructions` as `{ video, article }`. Fix every reference in both apps so they compile (server returns `video`/NULLs, web fixtures gain the fields); no behaviour yet (TRD §2.4–2.5) | 0030 | ✅ |
| 2.4 | `feeds.ts`: every feed and inbox schema in TRD §2.6, with tests | 0032 | ✅ |
| **Phase 3** | **Server data** | | |
| 3.1 | Migration 5 (TRD §3.1), tested from `user_version = 4` with a job in review and a saved job, and from empty | 0030, 0032 | ✅ |
| 3.2 | `jobStore.repository.ts` on `source_document`, `source_type`, `feed_id`, `feed_name` join; `feeds.repository.ts`; `feedItems.repository.ts` (TRD §3.2). Update `apps/server/CLAUDE.md` repositories line | 0030, 0032 | ✅ |
| **Phase 4** | **Adapter refactor** | | |
| 4.1 | `src/sources/` with the adapter interface, `video.adapter.ts` (today's `runJob` steps), `adapterFor`; `runJob` uses it; `completeTranscription` → `completeAcquisition`, `getTranscript` → `getSource`, `findTranscript` → `findSource`; `GET /api/jobs/:id/source` replaces `/transcript` and the web `getSource`/`useSource` follow. Behaviour-neutral: only the renames TRD §9 allows. Add `src/sources/` to `apps/server/CLAUDE.md` | 0030 | ✅ |
| 4.2 | `lockedPropertiesFor` used by `completeSummary`, `updateDraft` and `saveJob`; `toPublicJob` adds `source_type`, `feed_id`, `feed_name`. Video behaviour unchanged | 0030 | ✅ |

## Checkpoint B: Phase 5 (caret sync)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 5** | **Caret sync** | | |
| 5.1 | Add `@vitest/browser-playwright`; `browser` Vitest project (chromium, webkit, `*.browser.test.tsx`), jsdom project excludes it; `test:browser` script; README setup line; one trivial browser test proves it runs in both browsers (TRD §8.7 step 1) | 0033 | ✅ |
| 5.2 | `ReviewScreen.browser.test.tsx` reproducing the failure in rich and source mode, committed as `it.fails`; log line says exactly how it fails in each browser (TRD §8.7 step 2) | 0033 | ✅ |
| 5.3 | Fix the cause; remove `it.fails`; existing jsdom caret tests still pass; write the next-numbered ADR with the cause and fix; `apps/web/CLAUDE.md` gate includes `test:browser` (TRD §8.7 steps 3–4) | 0033 | ⬜ |

## Checkpoint C: Phase 6 (server articles)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Server articles** | | |
| 6.1 | `clients/http.client.ts` (`fetchResource`, manual redirects, size cap, timeout, charset, 304, typed errors) tested against a local server (TRD §4.2) | 0031 | ⬜ |
| 6.2 | Add `turndown` and `@types/turndown`; `sources/htmlToMarkdown.ts` with the rules in TRD §4.4, fixture-tested | 0031 | ⬜ |
| 6.3 | Add `@mozilla/readability` and `linkedom`; `sources/extractArticle.ts` (`extractArticle`, `fetchArticle`) with the article fixtures; `<base>` injection and relative links tested. **If Readability can't run on linkedom, stop and ask** (TRD §4.3) | 0031 | ⬜ |
| 6.4 | `sources/text.ts` (`articleFromText` and its title rules) and `article.adapter.ts`; `adapterFor( 'article' )` (TRD §4.1) | 0030, 0031 | ⬜ |
| 6.5 | Jobs service: `queueJob( body )` with detection, override and pasted text; step rules per source type; `fetching` in recovery; `submitPastedText`; article downloads (`md` only) (TRD §4.5) | 0030 | ⬜ |
| 6.6 | Summarizer for articles: `LOCKED_INSTRUCTIONS_VIDEO` / `_ARTICLE`, `buildSystemPrompt( guidance, kind )`, `summarizeSource` with the article message and output format, `cleanSummary` quote normalization, `formatSummary` for articles, `summarizeJob` passing the kind; settings returns both locked texts (TRD §5) | 0030 | ⬜ |
| 6.7 | Endpoints: `POST /api/jobs` new fields, `POST /api/jobs/:id/text`, download 409 for articles; `PATCH /api/settings` interval; each error status through `app.ts` (TRD §7) | 0030 | ⬜ |

## Checkpoint D: Phase 7 (web articles)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Web articles** | | |
| 7.1 | `jobs.api.ts` `createJob( body )` and `submitPastedText`; `useSubmitPastedText` (TRD §8.1) | 0030 | ⬜ |
| 7.2 | Submit form: "URL" field, `SourceTypeSwitch`, `PastedTextFields`, labels per type; `HomePage` sends `source_type` only when overridden (TRD §8.2) | 0030 | ⬜ |
| 7.3 | `JobProgress` for articles; **Paste text** on failed article jobs with `PasteTextDialog` (TRD §8.3) | 0030, 0031 | ⬜ |
| 7.4 | Review screen: `TranscriptPane` → `SourcePane` with the article view; `PropertiesPanel` article fields; `DownloadLinks` Markdown only for articles; video/article icon in the job list (TRD §8.4) | 0030 | ⬜ |

## Checkpoint E: Phase 8 (server feeds)
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **Server feeds** | | |
| 8.1 | Add `feedsmith`; `sources/feeds.ts` (`parseFeedXml`, `discoverFeed`, item key, content threshold) with the feed fixtures (TRD §6.1–6.2) | 0032 | ⬜ |
| 8.2 | `feeds.service.ts`: preview, create with baseline, update, delete (with and without inbox items), `checkFeed` (ETag, 304, 10-item cap, skipped count, errors), `checkDueFeeds` (TRD §6.3) | 0032 | ⬜ |
| 8.3 | `feedInbox.service.ts`: list, `summarizeItems` (all-or-nothing, profile order, full-text items as summarizing documents), `dismissItems`; auto-summarize path in `checkFeed` (TRD §6.4) | 0030, 0032 | ⬜ |
| 8.4 | `worker/feedPoller.ts` wired in `server.ts` and `shutdown.ts`; fake-timer tests (TRD §6.5) | 0032 | ⬜ |
| 8.5 | Feed and inbox endpoints, `BadGatewayError`, each error status through `app.ts` (TRD §7). Server docs: `apps/server/CLAUDE.md` (sources folder, new services, clients and worker, ADR list), root `CLAUDE.md` architecture paragraph (articles, pasted text, feeds and the inbox) | 0032 | ⬜ |

## Checkpoint F: Phase 9 (web feeds)
**Plan:** ⬜ [`plans/checkpoint-f.md`](plans/checkpoint-f.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 9** | **Web feeds** | | |
| 9.1 | `feeds.api.ts`, `feedItems.api.ts`, query keys; hooks `useFeeds`, `useFeedMutations`, `useFeedPreview`, `useFeedInbox`, `useSummarizeFeedItems`, `useDismissFeedItems` (TRD §8.1) | 0032 | ⬜ |
| 9.2 | Settings → Feeds: `FeedSettings` (interval, Check all now), `FeedList` (rows, switches, errors, skipped, menu) (TRD §8.5) | 0032 | ⬜ |
| 9.3 | `AddFeedDialog` (find, preview, add), `EditFeedDialog`, `DeleteFeedDialog` (TRD §8.5) | 0032 | ⬜ |
| 9.4 | Home page `FeedInbox` and `SummarizeItemsDialog`; feed chip in the job list and on the review screen (TRD §8.4, §8.6) | 0032 | ⬜ |

## Checkpoint G: Phase 10 (clean-up and verification)
**Plan:** ⬜ [`plans/checkpoint-g.md`](plans/checkpoint-g.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 10** | **Clean-up and verification** | | |
| 10.1 | Docs: `apps/web/CLAUDE.md` (submit form, source pane, Feeds settings, inbox, browser tests, ADR list), README (articles, paste, feeds and inbox, browser-test setup, new endpoints, roadmap) | — | ⬜ |
| 10.2 | Version 0.5.0 in every `package.json` (root, server, web, shared) and in the README status line | — | ⬜ |
| 10.3 | Final checks (report results, don't tick until Naresh confirms): `pnpm test`, `test:browser`, lint, typecheck in all three packages, web build; migration run against a copy of the real 0.4.0 database; browser checks from TRD §9 in light and dark, wide and narrow; then the real check with Naresh (TRD §9) | — | ⬜ |
| 10.4 | `docs/v0.5.0/release-notes.md` (new, changed, upgrade steps including a database backup and the browser-test setup, known issues, ADRs), linked from `docs/README.md` | — | ⬜ |

---

## Log
- 1.1: ADRs 0030–0033 set to Accepted in their files and the index; 0014 and 0015 marked as amended by 0030 in the index and their files. Docs only, no tests.
- 2.1: `source.ts` (`SourceType`, `VideoSource`, `ArticleMeta`, `ArticleSource`, `SourceDocument`, `ARTICLE_LIMITS`) and `detectSourceType.ts`, exported from the index. Host match is exact or a dot-boundary suffix, so `notyoutube.com` is an article. Shared 238 tests; lint and typecheck green. No existing test changed.
- 2.2: `NoteProperties` gains optional `author`, `site`, `published` (`channel`, `duration` now optional); `serializeNote` writes the TRD key order and skips undefined keys; `lockedPropertiesFor`; `applyLockedProperties` removes absent locked keys. Existing video fixtures round-trip unchanged (no existing test edited). Shared 245, server 727 tests; lint and typecheck green in shared, typecheck green in server and web.
- 2.3: contracts per TRD §2.4–2.5 (`fetching`; `Job` `source_type`/`feed_id`/`feed_name`; `CreateJobBody` `source_type`/`text`/`title` with the article-only refinement; `SubmitPastedTextBody`; `GetSourceResponse` replaces `GetTranscriptResponse`; `Settings.feed_check_interval_minutes`; `locked_instructions` as `{ video, article }`). Server: `toPublicJob` returns `video`/NULLs, `StoredJob` omits the new fields until 3.2, `/transcript` wraps the stored transcript as `{ source: { kind: "video", … } }`, `getSettings` falls back to 60, and the settings controller sends the video text for both locked texts until 6.6; `PATCH /api/settings` accepts the interval but does not store it until 6.7. Web: `getTranscript` parses `GetSourceResponse` (article → `ApiError`), `useSettings` reads `.video`, `fetching` labels in `JobList` and `JobProgress`. Existing tests changed: job and settings fixtures (server, web, shared), `locked_instructions` shape in the settings route test and web fixtures, `GetTranscriptResponse` → `GetSourceResponse` in the transcript route test, `getTranscript` api tests (new response shape), `saves both together` and `getSettings` expectations (interval field). Shared 277, server 728, web 629 tests; lint and typecheck green in all three.
- 2.4: `feeds.ts` with every feed and inbox schema from TRD §2.6, exported from the index. Feed URLs in `PreviewFeedBody` and `CreateFeedBody` are limited to http(s), per PRD §7. Red was confirmed by running the test file with the module absent. Shared 323 tests; lint and typecheck green. No existing test changed.
- 3.1: migration 5 (`addSourcesAndFeeds`, a function migration): `transcript` renamed to `source_document` and tagged `kind: "video"`, `source_type` and `feed_id` on jobs, `feeds` and `feed_items` with their indexes. Tested from `user_version = 4` with a job in review and a saved job, from empty, for the feed constraints, and for rollback. `jobStore.repository.ts` got only the column rename (it still writes `kind: "video"` and strips it on read; 3.2 types it properly). Existing tests changed: the `migration 4` block now upgrades with `migrations.slice( 0, 4 )` and drops its `toHaveLength( 4 )` (moved to the migration 5 block as 5); the jobs-columns test expects `source_document`, `source_type`, `feed_id`; the jobStore corrupt-row test updates `source_document`. Server 740 tests; lint and typecheck green.
- 3.2: `jobStore.repository.ts` on `source_document` (`SourceDocument`), `source_type`, `feed_id`, and `feed_name` from a LEFT JOIN on `feeds` in every read (deleted feeds keep their name; `feed_name` is never written); new `feeds.repository.ts` and `feedItems.repository.ts` per TRD §3.2. `feedItems` `listInbox` returns the stored row plus `feed_name`; the `source_type` of an inbox item is derived from its link in the feeds service (no column). `jobs.service.ts` reads/writes `source_document` and narrows to a video with `toTranscript` (4.2 replaces this with `lockedPropertiesFor`). `apps/server/CLAUDE.md` repositories lines updated. Existing tests changed: `transcript` → `source_document` (with `kind: "video"`) in the jobStore, summaryRuns, jobs service, jobs routes, runJob and pipeline integration tests; `buildJob` fixtures gain `source_type`, `feed_id`, `feed_name`. Server 778 tests; lint and typecheck green.
- 4.1: `src/sources/` with `adapter.ts` (`SourceAdapter`, `AdapterContext` = `{ job, workDir, markStatus }`), `video.adapter.ts` (the old `runJob` body: 403 retry, convert, transcribe, and the work-folder removal, which now lives in the adapter so it stays video-only) and `adapterFor` (article throws "No adapter for article jobs yet" until 6.4). `runJob` is now: summarizing → `summarizeJob`, else adapter → `completeAcquisition` → `summarizeJob`; a `ConflictError` from a refused status change is rethrown rather than failing the job, as before. Renames: `completeTranscription` → `completeAcquisition` (takes a `SourceDocument`), `getTranscript` → `getSource`, `findTranscript` → `findSource`; `GET /api/jobs/:id/source` replaces `/transcript` (the controller returns the stored document); web `getSource`/`useSource`/`jobKeys.source`, with `ReviewScreen` handing only a video source to `TranscriptPane`. `summarizeJob` fails the summary for an article ("Article summaries are not supported yet") until 6.6, with a test. Existing tests changed: the renames above, `kind: "video"` in `completeAcquisition` calls, `/transcript` → `/source` in the route tests (plus one test that the old path is 404), `useTranscript.test.ts` → `useSource.test.ts`, the web api test for the new function, and the `useTranscript` mocks in the JobPage and ReviewScreen tests; `runJob.test.ts` expectations are otherwise unchanged. New: `sources/index.test.ts`, `sources/video.adapter.test.ts`. `src/sources/` added to `apps/server/CLAUDE.md`. Server 792, web 629 tests; lint and typecheck green in both.
- 4.2: `completeSummary`, `updateDraft` and `saveJob` use `lockedPropertiesFor( document, created )`; `formatNote` now takes `document: SourceDocument` instead of `meta` and uses it too; `toPublicJob` reads `source_type`, `feed_id`, `feed_name` from the stored job (replacing the 2.3 constants). New tests cover an article job end to end through those three functions (article keys written, typed `channel`/`duration` dropped, `author` kept locked) and the public job fields. Existing tests changed: `note.formatter.test.ts` and the `completeSummary` note test pass `document` instead of `meta`. Video notes are unchanged. Server 798 tests; lint and typecheck green.
- 5.1: added `@vitest/browser-playwright` 5.0.4 (matches the installed vitest 5.0.4, so no vitest bump) and `playwright` 1.64.1 as web dev dependencies; `playwright` is added explicitly because pnpm only auto-installs it as a hidden peer, so `pnpm exec playwright install` could not find it (it is the package TRD §1 says comes with the plugin, at the version it already resolved). `vite.config.ts` has two Vitest projects: `unit` (jsdom, excludes `*.browser.test.tsx`) and `browser` (chromium and webkit, headless, `browser.setup.ts` loads jest-dom only). `test` runs `--project unit`; new `test:browser` runs `--project browser`. README gets the browser install line. Red was `vitest --project browser` failing with no such project. Browsers installed with `playwright install chromium webkit` (WebKit downloaded with Naresh's OK). Web 629 unit tests, 4 browser tests (2 per browser); lint, typecheck and build green.
- 5.2: `ReviewScreen.browser.test.tsx` renders the real `ReviewScreen` with the real MDXEditor and `TranscriptPane` (only the `api/` module and the folders, models, settings, profiles and source hooks are mocked), a 60-paragraph transcript with fractional starts and a note citing whole seconds, and drives it with Vitest browser `userEvent` in Chromium and WebKit. **The 0.3.0 failure did not reproduce**: clicking a timestamp line, arrowing onto it in rich text mode, arrowing onto it in source mode, and keeping the marker on a plain line all work in both browsers; the same on the real app (server on a scratch database with a seeded review job, built web app, headless Chromium and WebKit driven by a Playwright script, 1280x900). Likely cause of the old failure going away: 0.3.1 gave the pane `position: relative`, so `offsetTop` is relative to it. Naresh agreed (asked) to treat the real defects found as the caret-sync bug. The three `it.fails` tests fail, identically in both browsers, as follows: (1) rich and (2) source mode, a timestamp cited as a whole second that is the start of a paragraph (note cites 13:20 = 800; the paragraph starts at 800.4) marks `transcript-780`, the previous paragraph, instead of `transcript-800`, because `TranscriptPane` picks the last paragraph with `start <= focusSecond`; (3) source mode, a click on the front-matter line `duration: "20:00"` marks `transcript-1180` and scrolls to the end, instead of leaving the transcript alone, because `parseTimestampSeconds` reads the duration as a timestamp. Four tests pass as regression guards. Also: `tsconfig.browser.json` (typechecks `*.browser.test.tsx` with the `vitest/browser` types, which clash with jest-dom's matcher types if shared with the app project; `tsconfig.app.json` excludes them), `browser.setup.ts` runs RTL cleanup after each test, `.vitest/` (failure screenshots) git-ignored. Web 629 unit tests, 18 browser results (12 pass, 6 expected failures across both browsers); lint, typecheck and build green.
