# Checkpoint E plan: Phase 8 (server feeds)

Next: **Checkpoint E, task 8.1** (Plan cell ⬜). Checkpoints A–D are done. On approval: save this to `docs/v0.5.0/plans/checkpoint-e.md`, tick the Plan cell, commit `docs(plan): checkpoint E`, push, then start 8.1.

Read: PRD §6.5–6.6, TRD §6 and §7, ADRs 0030 and 0032, `tasks.md`, and the server code below. Only `apps/server` changes, plus the root `CLAUDE.md` architecture paragraph (task 8.5). Gate after every task: server `test`, `lint`, `typecheck` (and `build` at the end). Existing tests pass unchanged except renames and fixture additions; each change is listed in the log line. No test touches the network (local servers on port 0, saved XML fixtures).

## Context
Checkpoint A added the feed tables and repositories (`feeds.repository.ts`, `feedItems.repository.ts`), shared feed schemas and the adapter layer; checkpoint C added article fetching, `queueJob( body, extra )` and the article pipeline. This checkpoint builds the feed intake on top: parse and discover feeds, create feeds with a baseline, check them on a schedule with ETag/304 and a 10-item cap, keep new items in an inbox, summarize or dismiss inbox items (or auto-summarize), a poller beside the worker and sweeper, and the endpoints. The web UI is checkpoint F.

Code the plan builds on: `clients/http.client.ts` (`fetchResource`, typed errors), `sources/htmlToMarkdown.ts`, `sources/text.ts` (`articleFromText`), `services/jobs.service.ts` (`queueJob( body, { feed_id } )`), `services/prompts.service.ts` (`assertActiveProfile`), `services/settings.service.ts` (`getSettings().feed_check_interval_minutes`), `worker/sweeper.ts` and `shutdown.ts` (the timer pattern), `errors.ts`. Repositories already have `insertFeed`, `listDueFeeds`, `recordCheck`, `insertItemIfNew`, `setItemStatus`, `countInbox`, `dismissInboxForFeed`, `listInbox`, `findItemsByIds`.

## 8.1 `sources/feeds.ts`: parsing and discovery (TRD §6.1–6.2)
- Add `feedsmith` (3.0.1 is current; pinned). **First check its real API with a scratch script** (the TRD says to confirm it against the design; its README doesn't show the call signatures): the universal parser and the format fields for RSS (`content:encoded`, `guid`, `dc:creator`, `pubDate`), Atom (`id`, `content`, `published`/`updated`, `link rel="alternate"`), RDF, and the YouTube feed (`yt:videoId`). If it can't give me what TRD §6.1 needs, stop and ask.
- **Fixtures** (`src/test-support/feeds/*.xml`, hand-written, no network): an RSS 2.0 blog with `content:encoded`, an Atom feed, a Medium feed, a Substack feed, a YouTube channel feed, plus HTML pages for discovery (one with an RSS alternate link, one with an Atom link, one with a relative link, one with no feed link).
- **Tests first** (`feeds.test.ts`):
  - `parseFeedXml( xml )`: per fixture, the title and items `{ guid, link, title, published_at, author, content_html }`; dates as ISO or null when missing or invalid; items without a link dropped; non-feed XML or HTML throws.
  - Item rules: the key is the GUID/Atom id, else the link with its fragment removed, else `sha256( title + published_at )`; the source type comes from `detectSourceType( link )` (the YouTube feed gives video items); `content_markdown` comes from `htmlToMarkdown` and is kept only at 500 to 300,000 characters, else null.
  - `discoverFeed( url )` against a local server: a feed URL is used directly; an HTML page's first `<link rel="alternate">` of type RSS, Atom or JSON Feed is resolved against the final URL, fetched and parsed; a page with no link gives `ValidationError( 'No feed found at this address' )`; an unreachable site or a non-2xx surfaces the client's typed error.
- Commit `feat(8.1): feed parsing and discovery`.

## 8.2 `services/feeds.service.ts` (TRD §6.3)
- **Tests first** (`feeds.service.test.ts`, `fetchResource` mocked with fixture XML; no auto-summarize yet, the `auto_summarize` path is 8.3):
  - `previewFeed( url )` returns the feed URL, title and latest item (newest by date, else feed order) or null.
  - `createFeed`: discovers and stores the feed; 409 for an active feed with the same feed URL (a deleted one doesn't count); `profile_id` validated with `assertActiveProfile`; name defaults to the feed title; **baseline**: every current item stored as `baseline` except the newest as `inbox`, content kept only for that one; records the check (time, ETag, Last-Modified); a feed with no items works; the unreachable case surfaces a 502 (`BadGatewayError` is added in 8.5, so until then the typed client error propagates and the test pins the message).
  - `updateFeed` (name, profile incl. clearing to null, enabled, auto_summarize), `deleteFeed( id, { removeInboxItems } )`: soft delete; with the flag the inbox items become `dismissed`, without it they stay; unknown id `NotFoundError`.
  - `checkFeed( id )`: sends the stored ETag/Last-Modified; **304** records the check only; otherwise parses and inserts new items in feed order, the first 10 new ones as `inbox`, the rest as `skipped` with `last_skipped_count` set (reset to 0 on a check with no overflow); an item already seen (even dismissed or reordered) is never added again; a fetch or parse error records `last_error` and the check time and changes nothing else; a good check clears `last_error`; disabled and deleted feeds are refused; the stored validators update.
  - `checkDueFeeds()`: checks the due feeds one at a time, least recently checked first; one feed's error never stops the others; the interval comes from settings.
- **Repository additions with tests:** an exported `inTransaction( fn )` in `database.ts` so a service can make several writes atomic without touching the connection (layer rule); used by create (feed plus baseline).
- Commit `feat(8.2): feeds service`.

## 8.3 `services/feedInbox.service.ts` and the auto-summarize path (TRD §6.4)
- **Tests first** (`feedInbox.service.test.ts`, `jobs.service` real, Claude never called):
  - `listInbox()` maps to `FeedItem` (feed name, `detectSourceType( link )`).
  - `summarizeItems( { ids, model?, profile_id? } )`: all-or-nothing (any id that isn't an inbox item gives a 409 naming the bad ones and queues nothing); profile order is the body's, else the feed's, else none; model is the body's, else none; a deleted feed profile falls back to the default instead of failing; article items with full text become jobs already in `summarizing` with an article document (origin `feed`, author from the item, site from the feed name, published date); other article items are queued for fetching; video items are queued for download; each item becomes `queued` with its `job_id`; the jobs carry `feed_id`.
  - `dismissItems( ids )`: inbox items become `dismissed` (and lose their content); other ids are ignored.
  - `checkFeed` for an `auto_summarize` feed (and `createFeed`'s newest item): new items skip the inbox and are queued through the same function with no overrides, still subject to the 10-item cap; items over the cap are `skipped`.
- **Code:** `queueJob`'s second argument grows an optional `document` (an `ArticleSource`) so a full-text feed item skips the fetch; one shared `queueFeedItem` used by both paths.
- Commit `feat(8.3): feed inbox`.

## 8.4 `worker/feedPoller.ts` (TRD §6.5)
- **Tests first** (fake timers, `checkDueFeeds` mocked, like `sweeper.test.ts` and `worker.test.ts`): ticks every 60 seconds; a tick while a pass is running does nothing (no overlapping passes); the returned stop function clears the timer and awaits a running pass; the interval setting is read on every tick (a changed setting takes effect without a restart); an error in a pass is logged and doesn't stop the poller.
- **Code:** `startFeedPoller(): () => Promise< void >`; wired in `server.ts` after the worker and sweeper and stopped in `shutdown.ts` with the worker (the shutdown test gains the new option and asserts it is awaited).
- Commit `feat(8.4): feed poller`.

## 8.5 Endpoints and docs (TRD §7)
- **Tests first** (Supertest through `app.ts`, each status, `fetchResource` mocked): `GET /api/feeds`; `POST /api/feeds/preview` (200; 400 no feed or bad body; 502 unreachable); `POST /api/feeds` (201; 400; 409 duplicate; 502); `PATCH /api/feeds/:id` (200; 400 empty or bad body; 404); `DELETE /api/feeds/:id?remove_items=true|false` (204; 404; a bad query value 400); `POST /api/feeds/:id/check` (200 with the feed, a failed check is still 200 with `last_error`; 404); `POST /api/feeds/check` (200 with all feeds); `GET /api/feed-items`; `POST /api/feed-items/summarize` (200 with the jobs; 400; 409 for a non-inbox id, nothing queued); `POST /api/feed-items/dismiss` (204; 400). `errors.test.ts`: `BadGatewayError` maps to 502.
- **Code:** `BadGatewayError` in `errors.ts` for an unreachable site during preview and create (the service wraps the client's `UnreachableError`/`HttpStatusError` there; a feed that parses badly stays a 400); routes, controllers and `Feed`/`FeedItem` mapping per the existing pattern; `Feed.inbox_count` from `countInbox`.
- **Docs:** `apps/server/CLAUDE.md` (the sources folder, feeds and inbox services, the poller, the new routes and errors, ADR 0032 in its list); the root `CLAUDE.md` architecture paragraph (articles, pasted text, feeds and the inbox, per tasks.md).
- Commit `feat(8.5): feed and inbox endpoints`.

## Checkpoint end and report
Server `test`, `lint`, `typecheck`, `build`. A real-world check as in checkpoint C: the server on a scratch database, a small local Node server serving the fixture feed and article pages (not Python's, which misbehaved in this sandbox), Claude pointed at a closed port; with curl I'll add a feed (preview, then create), see the baseline item in the inbox, publish a new item in the served feed and **Check now**, summarize from the inbox with another profile (the job reaches its summary attempt), dismiss one, check the 304 path, break the feed and see `last_error`, delete with and without removing items, and watch the poller pick up a due feed. No web changes, so no screenshots. No ADR is expected unless feedsmith forces a change.

## Risks and decisions to confirm
1. **feedsmith's real API** is checked first (8.1); if it can't supply what the TRD needs I stop and ask.
2. **`inTransaction`** is a small new export in `database.ts` (no new dependency) so services stay off the connection.
3. **`queueJob` extra** gains an optional article `document` for full-text feed items (TRD §6.4 needs it; the TRD §4.5 signature only names `feed_id`).
4. **Deleted feed profile:** the TRD doesn't say what happens when a feed's profile was deleted; I fall back to the default profile rather than failing the summarize.
5. **Poller tick** is 60 seconds as the TRD says; the first pass runs at the first tick, not at boot.
