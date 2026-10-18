# Checkpoint A plan: Phases 1–4 (kick-off, contracts, data, adapter refactor)

Next: **Checkpoint A, task 1.1** (Plan cell ⬜). On approval: save this to `docs/v0.5.0/plans/checkpoint-a.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint A`, push, then start 1.1.

Read: PRD, TRD, `tasks.md`, ADRs 0030 and 0032 (0031 and 0033 are not needed until C and B). Order is strict. Every task: red → green → refactor → tick Status plus log line → commit `feat(<id>): …` → push. Gate after each task: `test`, `lint`, `typecheck` for each package touched (shared, server, web).

Existing tests keep passing unchanged except the renames and fixture additions TRD §9 allows. I'll list each in the log line.

---

## 1.1 Accept ADRs (docs only, no tests)
- Files: `docs/decisions/0030…0033-*.md` (Status → Accepted), `docs/README.md` (index rows for 0030–0033 → Accepted; 0014 → "Accepted (amended by 0027, 0028, 0030)"; 0015 → "Accepted (amended by 0030)"), `0014-claude-summarizer.md` and `0015-transcript-lifecycle.md` Status lines.
- Verify: grep the status lines. Commit `docs(1.1): accept ADRs 0030–0033`.

## 2.1 `source.ts` and `detectSourceType.ts` (shared)
- Tests first (`source.test.ts`, `detectSourceType.test.ts`):
  - `SourceDocument` parses a video (today's transcript + `kind`) and an article, and rejects a missing or unknown `kind`, empty `markdown`, bad `source` URL, bad `published` format.
  - `ARTICLE_LIMITS` values.
  - A table for detection: youtube.com, www./m.youtube.com, youtu.be, vimeo, dailymotion, tiktok, twitch → video; medium.com, a lookalike such as `notyoutube.com` → article; garbage string → article.
- Red: modules missing. Green: `source.ts` (reuses `TranscriptMeta`/`Segment` from `transcript.ts`), `detectSourceType.ts`, both exported from `index.ts`.
- Matching "is or ends with": use a `.`-boundary check so `notyoutube.com` is not a video.

## 2.2 `NoteProperties` and locked properties (shared, `note.ts`)
- Tests first (`note.test.ts`):
  - Existing video fixtures round-trip byte for byte (these already exist and must pass unchanged).
  - Article note serializes keys in the order `title, source, author, site, published, created, tags`.
  - `parseNote` accepts both sets; a note with neither channel nor author is still valid.
  - `lockedPropertiesFor( video, created )` gives `source, channel, duration, created`.
  - `lockedPropertiesFor( article, created )` gives `source, created` plus the non-null `author`/`site`/`published`.
  - `applyLockedProperties` removes locked-family keys the document doesn't supply (a typed `duration` on an article note disappears; a video note keeps its keys).
- Green:
  - `channel`, `duration`, `author`, `site`, `published` become optional in the schema.
  - `serializeNote` emits keys in TRD order and skips undefined ones.
  - `LockedProperties` becomes a partial of the locked keys plus required `source` and `created`.
  - Add `lockedPropertiesFor`.
  - `applyLockedProperties` deletes absent locked keys.
- Fallout: server callers keep compiling. They still pass full video locked props until 4.2.
- Also check `database.ts` `addNoteColumns` (migration 2) still type-checks with the optional keys.

## 2.3 Job, request and settings contracts, with compile fixes in both apps
- Tests first:
  - `job.test.ts`: `fetching` status; `source_type`, `feed_id`, `feed_name` required, nullable where applicable.
  - `api.test.ts`:
    - `CreateJobBody` accepts `source_type`, `text` (200–300,000 chars, trimmed) and `title` (1–300).
    - The refinement rejects `text` or `title` with an explicit video, or with a detected video URL and no override.
    - `SubmitPastedTextBody` rules.
    - `GetSourceResponse` replaces `GetTranscriptResponse` (the old test is renamed).
  - `summarizer.test.ts`: `feed_check_interval_minutes` allowed values; `UpdateSettingsBody` accepts it alone; `locked_instructions` is `{ video, article }`.
- Green: shared schemas as TRD §2.4–2.5.
- Compile fixes (no new behaviour):
  - Server:
    - `toPublicJob` returns `source_type: 'video'`, `feed_id: null`, `feed_name: null`.
    - `getSettings` is unchanged for now; `feed_check_interval_minutes` falls back to 60 in the service (TRD §5.4).
    - The `/api/settings` controller returns `{ video: LOCKED_INSTRUCTIONS, article: LOCKED_INSTRUCTIONS }`. **Placeholder until 6.6 writes the real article text.**
    - The transcript endpoint returns `{ source: { kind: 'video', ...transcript } }`, tagging the stored transcript at the controller because migration 5 hasn't run yet. The path stays `/transcript` until 4.1.
  - Web:
    - Job fixtures gain the new fields.
    - `jobs.api.ts` parses `GetSourceResponse`.
    - The consumers (`useTranscript`, `TranscriptPane`, `LockedInstructions`) use the `video` branch and `.video` text.
    - Renames to `useSource`/`SourcePane` wait for 4.1 and 7.4.
- Existing tests changed: fixtures, `locked_instructions` shape, transcript response shape. Listed in the log.

## 2.4 `feeds.ts` (shared)
- Tests first (`feeds.test.ts`): every schema in TRD §2.6 with valid and invalid cases. Cases to cover: `FeedName` trim and 1–100, `UpdateFeedBody` needs at least one field, `ids` min and max counts, `Feed` field set, `FeedItem.source_type`.
- Green: `feeds.ts` plus the `index.ts` export.

## 3.1 Migration 5 (server `database.ts`)
- Tests first (`database.test.ts`):
  - Build a DB at `user_version = 4` (run the first 4 migrations), insert a job in `ready_for_review` and a `saved` job with transcripts, then run migration 5.
  - Assert:
    - `user_version = 5`.
    - The column is `source_document`, and the review job's JSON parses as a `video` `SourceDocument`.
    - The note is untouched.
    - `source_type = 'video'` and `feed_id` is NULL.
    - The `saved` row with a NULL transcript stays NULL.
    - `feeds`, `feed_items`, and both indexes exist, and `(feed_id, item_key)` uniqueness holds.
  - A fresh empty DB reaches version 5.
- Green: a function migration appended to `migrations`, with the SQL from TRD §3.1.
- Note: the earlier migration functions still read `transcript`, which is fine because they run before migration 5 renames it.
- Watch: the new `jobStore` code will reference `source_document`, so 3.1 and 3.2 leave the repository broken between them. To keep each commit green, 3.1 also does the minimal `transcript` → `source_document` column rename in `jobStore.repository.ts` SQL and row mapping. 3.2 then adds the typing and joins.

## 3.2 Repositories
- Tests first:
  - `jobStore.repository.test.ts`:
    - A `StoredJob` has `source_document: SourceDocument | null`, `source_type`, `feed_id`.
    - Round trip through insert, find and update.
    - `listActiveJobs` returns `feed_name` from a join on `feeds`, and a soft-deleted feed keeps its name.
  - `feeds.repository.test.ts`: the functions in TRD §3.2 including `listDueFeeds` (never checked, due, not due, disabled, deleted) and `recordCheck`.
  - `feedItems.repository.test.ts`:
    - `insertItemIfNew` returns true then false on a duplicate.
    - `listInbox` is newest first and inbox only.
    - `setItemStatus` clears `content_markdown` when the status isn't `inbox`.
    - `countInbox`, `dismissInboxForFeed`.
- Green:
  - `StoredJob` swaps `transcript` for `source_document` (nullable `SourceDocument`), plus `source_type`, `feed_id`, `feed_name` (read-only, from the join).
  - Insert and update are adjusted to match.
  - The two new repositories are synchronous free functions on `getDatabase()`.
  - Update the repositories line in `apps/server/CLAUDE.md`.
- Server callers of `job.transcript` (`jobs.service.ts`, `summarizeJob.ts`) move to `job.source_document`, narrowed to the `video` kind. Their tests get `kind: 'video'` fixtures. Listed in the log.

## 4.1 Adapter refactor (server)
- Tests first:
  - `sources/video.adapter.test.ts`: the existing `runJob` download / 403-retry / convert / transcribe tests move here (same mocks, same expectations). The adapter returns a `video` document and calls `markStatus` for downloading → converting → transcribing.
  - `sources/index.test.ts`: `adapterFor( 'video' )` returns the video adapter; `'article'` throws "not implemented" until 6.4.
  - `runJob.test.ts` stays with its behaviours unchanged: summarizing jobs go straight to `summarizeJob`, errors go to `failJob`, the work folder is removed.
  - Renames in `jobs.service.test.ts` and the others:
    - `completeTranscription` → `completeAcquisition`
    - `getTranscript` → `getSource`
    - `findTranscript` → `findSource`
  - Route test for `GET /api/jobs/:id/source` (the old `/transcript` path now 404s). Web `jobs.api.test.ts`/`useSource` follow.
- Green:
  - `src/sources/` with the `SourceAdapter` interface, `video.adapter.ts` (the current `runJob` body, including `downloadWithRetry`), and `index.ts` with `adapterFor`.
  - `runJob` becomes: summarizing → `summarizeJob`; otherwise it creates the work dir, runs the adapter, calls `completeAcquisition`, removes the work dir, then runs `summarizeJob`.
  - `completeAcquisition( id, document )` accepts the document and the `transcribing` status (the `fetching` path is added in 6.5).
  - Rename the service functions.
  - Controllers and routes move to `/source`. They return `{ source }` straight from `getSource`, with the controller-side tagging from 2.3 removed.
  - Web:
    - `getSource` in `jobs.api.ts`.
    - `useTranscript` → `useSource` (and `useTranscript.test.ts`).
    - Query key rename.
    - `ReviewScreen`, `TranscriptPane`, `JobPage` tests use the new names.
  - Add `src/sources/` to `apps/server/CLAUDE.md`.
- Refactor step: confirm `runJob` stays small and the adapter file is easy to read.

## 4.2 `lockedPropertiesFor` in the service; `toPublicJob` fields
- Tests first (`jobs.service.test.ts`):
  - `completeSummary`, `updateDraft` and `saveJob` produce the same video notes as before (existing assertions).
  - Add a test that a stored article document (inserted directly via the repository) yields article locked properties, and that a hand-typed `duration` is dropped on `updateDraft`.
  - `toPublicJob` returns the stored `source_type`, `feed_id`, `feed_name`.
- Green: replace the hand-built `channel`/`duration` objects in the three functions with `lockedPropertiesFor( document, created )`, and read the three fields from the stored job in `toPublicJob` (replacing the 2.3 constants).

---

## Decisions to confirm
1. **Article locked text placeholder.** In 2.3 the settings response sends the video text for both `video` and `article` until 6.6 writes the real article text. The alternative is an empty string for `article`, which the Settings screen would show as blank. I recommend the placeholder.
2. **Controller-side tagging in 2.3.** `/transcript` returns `{ source: { kind: 'video', … } }` between 2.3 and 3.1 because stored rows only gain `kind` in migration 5. Nothing else is needed.
3. **Column rename in 3.1.** The `jobStore` SQL gets the minimal column rename in 3.1 so every commit stays green. This is not a design change.

## Checkpoint report (at the end)
Per-task commit hashes; test, lint and typecheck per folder (shared, server, web); the placeholder note; no ADR is expected, so no TRD change. Anything deferred.
