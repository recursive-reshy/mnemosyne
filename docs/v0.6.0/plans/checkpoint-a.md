# Checkpoint A plan: Phases 1–3 (kick-off, contracts, data)

Next: **Checkpoint A, task 1.1** (Plan cell ⬜). On approval: save this to `docs/v0.6.0/plans/checkpoint-a.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint A`, push, then start 1.1.

Read: PRD, TRD, `tasks.md`, ADRs 0035 (gmail), 0037 (postings), 0038 (inbox) in full when their task starts. Order is strict. Every task: red (watch it fail for the right reason) → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: `test`, `lint`, `typecheck` for every package touched (shared, server, web).

Existing tests pass unchanged except the changes TRD §9.1 allows plus the compile fixes below; each is listed in its log line.

## Decisions taken while planning
- **2.2:** the TRD says the web is the only consumer of the `FeedItem` contracts. It isn't: `feeds.controller.ts`, `feedInbox.service.ts` and `feeds.routes.test.ts` use them, and `/api/feed-items` stays until 8.4. So the old feed-item request/response schemas move to a local server file until 8.4 deletes them. Recorded as **ADR 0039** ("feed-item schemas stay server-local until the unified inbox routes land"); it adds nothing new for the TRD to conflict with beyond §2.2's "web is the only consumer" wording, which I'll flag in the report.
- **2.4:** `Settings.extraction_model` is required in the schema, but its haiku fallback (async `listModels()`) is task 9.5. Until then `getSettings()` returns the stored value, else `SHIPPED_DEFAULT_MODEL`. 9.5 swaps in the fallback.

---

## 1.1 Accept ADRs (docs only, no tests)
- Files: `docs/decisions/0035…0038-*.md` Status → Accepted; `docs/README.md` index rows 0035–0038 → Accepted, 0032 row → "Accepted (amended by 0038)"; `0032-rss-feeds-inbox-poller.md` Status line → "Accepted (amended by 0038)".
- Verify: grep the status lines. Commit `docs(1.1): accept ADRs 0035–0038`.

## 2.1 `packages/shared/src/gmail.ts`
- Tests first (`gmail.test.ts`): `GmailAccount` parses each status; `GmailLabel` type; `GmailMatch` labels (1–10 ids; 0 and 11 rejected) and query (trimmed, 1–500; blank and 501 rejected), unknown `kind` rejected; `SourceName` trims and bounds 1–100; `GmailSource` round trip (jobs source with `profile_id` null / `auto_summarize` false); `PreviewGmailSourceBody/Response` (null `newest`, `overlaps`); `CreateGmailSourceBody` refinement: `profile_id`, `auto_summarize`, `backfill` accepted only with `newsletter`, each rejected with `jobs`; `backfill` enum; `UpdateGmailSourceBody`: at least one field, `destination` not accepted, newsletter-only fields (`profile_id`, `auto_summarize`) parse (the jobs restriction is a service check since the body can't know the destination, noted in a test comment), `profile_id: null` allowed.
- Red: module missing. Green: `gmail.ts` per TRD §2.1, exported from `index.ts`.

## 2.2 `inbox.ts`, remove the `FeedItem` contracts (ADR 0039)
- Tests first:
  - `inbox.test.ts`: `InboxItemRef` kinds; `InboxItem` discriminates on `kind` (feed needs `feed_id`/`feed_name`/nullable `published_at`; gmail needs `source_id`/`source_name`/`sender`/non-null `published_at`, `source_type` only `article`); `SummarizeInboxBody` 1–50 refs, optional model/profile; `DismissInboxBody` 1–200; list/summarize responses.
  - Server `controllers/feedItems.schemas.test.ts`: the moved cases from `feeds.test.ts` (`FeedItem`, list, summarize `ids`, dismiss `ids`) unchanged.
- Green:
  - shared: add `inbox.ts`, export it; delete the four `FeedItem*` blocks and their tests from `feeds.ts` / `feeds.test.ts`.
  - server: new `controllers/feedItems.schemas.ts` holds the old schemas verbatim; `feeds.controller.ts`, `feedInbox.service.ts` and `feeds.routes.test.ts` import from it. No behaviour change.
  - web: `api/feedItems.api.ts` still calls `/api/feed-items`. It parses the old response shape locally (`InboxItem` feed variant minus `kind`) and returns `InboxItem` feed items with `kind: 'feed'`; summarize/dismiss take `InboxItemRef[]` and send their `id`s. Hooks, `FeedInbox`, `SummarizeItemsDialog` (`Omit< SummarizeInboxBody, 'items' >`) and `feed.fixture.ts` repoint to the new types. Their tests change only for the type/arg shape.
  - `docs/decisions/0039-…md`, `docs/README.md` row, task 2.2 ADR column.
- Verify: shared, server, web test + lint + typecheck.

## 2.3 `postings.ts`
- Tests first (`postings.test.ts`): `PostingDetails` accepts a full record and the empty shape (`budget` null, `skills` [], `extra` []); budget types and nullable min/max; client rating number, `payment_verified` boolean|null; `Posting` requires url/uuid/ints; `ListPostingsQuery` coerces and defaults (`limit` 50, `offset` 0), rejects limit 0/101, offset −1, `q` > 200; `ListPostingsResponse` with `platforms`; `AlertEmailStatus`; `AlertEmail`; `ListAlertEmailsQuery`; `PostingSightingsResponse`.
- Query values arrive as strings, so `limit`/`offset` use `z.coerce.number().int()`; the test covers a string input.
- Green: `postings.ts`, exported.

## 2.4 Changes to existing contracts
- Tests first:
  - `source.test.ts`: `ArticleMeta.origin` accepts `email`.
  - `job.test.ts`: `gmail_source_id` / `gmail_source_name` required and nullable.
  - `summarizer.test.ts`: `Settings.extraction_model` required non-empty; `UpdateSettingsBody` accepts it alone; refine message lists it.
  - Server `settings.service.test.ts`: `getSettings()` returns `extraction_model` = stored value, else `claude-sonnet-5-5`; `updateSettings` validates with `assertKnownModel` (rejects an unknown id, stores a known one).
  - Server `jobStore.repository.test.ts` / `jobs.service.test.ts`: jobs carry `gmail_source_id: null` and `gmail_source_name: null`.
- Green:
  - shared schemas.
  - Server: `jobStore.toStoredJob` adds the two nulls (the column arrives in 3.1/3.2); `jobs.service.ts` and `feedInbox.service.ts` job builders set them null; `settings.service.ts` as above.
  - Compile fixes only: StoredJob/Job fixtures in server tests (`jobStore`, `jobs.service`, `summarizeJob`, adapter tests, `feeds.routes`, `summaryRuns`, `shared job/api/feeds` tests) and web fixtures (`job.fixture.ts`, `summarizer.fixture.ts`) gain the new fields.

## 3.1 Migration 6 `addGmailAndPostings`
- Tests first (`database.test.ts`, following the existing "from version N" cases):
  - from empty: `user_version` = 6 and all six tables exist (`gmail_account`, `gmail_sources`, `gmail_messages`, `job_postings`, `posting_sightings`, `extraction_runs`) with the `jobs.gmail_source_id` column and the two indexes.
  - from version 5 (`runMigrations` with `migrations.slice( 0, 5 )`, then insert a feed, a `feed_items` inbox row and a `ready_for_review` job, then run all): those rows are byte-identical afterwards; `gmail_source_id` is NULL on the job; version 6.
  - constraints: `gmail_account.id` must be 1; `UNIQUE ( source_id, message_id )`; `job_postings.dedupe_key` unique; `posting_sightings` primary key.
- Red: fails on the missing tables / `migrations.length`. Green: add `addGmailAndPostings` (the TRD §3.1 SQL, as one `db.exec`) to `migrations`. The test-support in-memory setup picks it up automatically.

## 3.2 Repositories (each: `<name>.repository.test.ts` first, in-memory DB via `database.setup.ts`)
- `gmailAccount`: `findAccount` (undefined when empty), `saveAccount` upsert id 1 (second save replaces, still one row), `setAccountStatus`, `deleteAccount`. Row schema keeps `refresh_token_enc` as stored.
- `gmailSources`: insert/find (deleted included)/list (not deleted, by lower name)/update/`markSourceDeleted`; JSON round trip of `label_ids`; booleans; `listDueSources( now, intervalMinutes )` table: never checked, older than interval, within interval, disabled, deleted; `recordSourceCheck`; `listActiveSourcesByMatch` returns active sources with `match_kind`, `label_ids`, `query`.
- `gmailMessages`: `insertMessageIfNew` (true then false for the same `source_id`+`message_id`, different source inserts); `findMessagesByIds`; `listNewsletterInbox` (inbox status, newsletter sources only, newest `added_at` first, joined with source name); `setMessageStatus` (sets `job_id`; clears `body_html`/`body_text` when a newsletter row leaves `inbox`, keeps them for jobs-source rows); `listPendingAlerts( sourceId, limit )` (pending, or failed with `attempts < 3`, oldest first, limit honoured); `recordAttempt` (status, error, `attempts + 1`); `listAlertEmails( { status, limit, offset } )` with total, source name and postings count from sightings; `countInbox`; `dismissInboxForSource` (inbox → dismissed with bodies cleared).
- `postings`: `upsertPosting` insert, conflict on `dedupe_key` updates `title`/`url`/`posted_at`/`details`/`last_seen_at` but keeps `id`/`first_seen_at`, sighting idempotent; `listPostings` (newest `first_seen_at`, `total` vs `filtered`, `q` on title / description / skills, `%` and `_` escaped, platform filter, limit/offset) — the listing lands here because TRD §3.2 names it, with its server-side shaping left to 9.4; `listPlatforms`; `listSightings`; `countPostingsForSource`.
- `extractionRuns`: `insertExtractionRun` returns the stored row incl. nullable tokens/cost.
- `jobStore.repository`: tests that `gmail_source_id` round-trips through insert/update/find, and `gmail_source_name` is joined from `gmail_sources` (also for a soft-deleted source) in `findJobById`, `listActiveJobs`, `findNextRunnableJob`. Green: column in `toRow`, `INSERT`, `UPDATE`; `SELECT_JOB` joins `gmail_sources`; remove the 2.4 null stubs in `toStoredJob`.
- `apps/server/CLAUDE.md`: add the new repositories to the folder-structure `repositories/` line (the file has no separate repositories list).

---

## Done when
All six repositories and the migration are green; shared, server and web `test`, `lint`, `typecheck` pass after every task; `tasks.md` ticked with log lines. Then stop and report: tasks with hashes, results per folder, ADR 0039 and its effect on TRD §2.2, and any deferred items.
