# Mnemosyne v0.5.0 — Technical Requirements

Companion to `docs/v0.5.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.4.0 code at commit `a9579ba`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet.

## 1. Changes at a glance
- **Shared:** a `SourceDocument` union (video transcript or article) replaces `Transcript` as what a job holds; `detectSourceType( url )`; note properties gain optional article keys; `Job`, `CreateJobBody` and `Settings` gain fields; new feed and inbox schemas.
- **Server:**
  - two layers (ADR 0030): **intakes** find things to summarize (feeds now, Gmail later) and **adapters** turn a job into a `SourceDocument` (`video`, `article`, `text`);
  - the video path moves behind the adapter interface unchanged; a new article adapter (fetch → linkedom → Readability → turndown, ADR 0031); pasted text and full-text feed items build an article document directly;
  - an article version of the locked instructions and output schema;
  - migration 5: job columns, the `transcript` column renamed, feed tables;
  - a feed poller beside the worker and sweeper, feed discovery, an inbox (ADR 0032);
  - new and changed endpoints for jobs, feeds and the inbox.
- **Web:** URL field with a Video / Article switch and a paste box; article pane and properties on the review screen; **Paste text** on failed article jobs; Settings → Feeds; a **From feeds** inbox on the home page; caret sync fixed and covered by browser-mode tests (ADR 0033).
- **New dependencies** (and only these):
  - server: `@mozilla/readability`, `linkedom`, `turndown`, `feedsmith` (dependencies); `@types/turndown` (dev);
  - web: `@vitest/browser-playwright` (dev; brings `@vitest/browser` and `playwright`).
  - Pin each to the version current when the task adds it. Check each package's actual API against this TRD before using it; if it differs in a way that changes the design, stop and ask.
- No Docker or host changes. Browser-mode tests run on Naresh's Mac only.

## 2. Shared contracts (`packages/shared`)

### 2.1 Source documents (`source.ts`, new; `transcript.ts` stays for `Segment` and `TranscriptMeta`)
```ts
SourceType   = 'video' | 'article'

VideoSource  = { kind: 'video', meta: TranscriptMeta, segments: Segment[] }   // today's Transcript plus kind

ArticleMeta  = { title: string.min(1), source: url, author: string | null, site: string | null,
                 published: string | null,          // YYYY-MM-DD when known
                 fetched_at: iso,
                 origin: 'fetched' | 'pasted' | 'feed' }
ArticleSource = { kind: 'article', meta: ArticleMeta, markdown: string.min(1) }

SourceDocument = z.discriminatedUnion( 'kind', [ VideoSource, ArticleSource ] )
```
- `Transcript` is kept as an alias of `VideoSource` minus `kind` only where the formatters need it (SRT, TXT, Markdown transcript); everything that holds "what this job is about" uses `SourceDocument`.
- `ARTICLE_LIMITS = { minExtractedChars: 500, minPastedChars: 200, maxChars: 300_000 }` exported from `source.ts`, so the web form and the server agree.

### 2.2 Detection (`detectSourceType.ts`, new)
`detectSourceType( url: string ): SourceType`. Video when the host, after stripping `www.` and `m.`, is or ends with one of `youtube.com`, `youtu.be`, `vimeo.com`, `dailymotion.com`, `tiktok.com`, `twitch.tv`; otherwise article. Unparseable URLs return `'article'` (the URL schema rejects them anyway). Table-driven tests.

### 2.3 Note properties (`note.ts`)
- `NoteProperties` = `title`, `source`, `created`, `tags` (required) plus optional `channel`, `duration` (videos) and `author`, `site`, `published` (articles).
- `serializeNote` writes keys in this order and leaves out any that are undefined: `title, source, channel, duration, author, site, published, created, tags`. `parseNote` accepts either set. Existing video notes round-trip byte for byte (test with the current fixtures).
- `LockedProperties` = everything except `title` and `tags`. New `lockedPropertiesFor( document: SourceDocument, created: string ): LockedProperties`: video gives `source, channel, duration, created` as today; article gives `source, created` plus `author`, `site`, `published` when not null. `applyLockedProperties` also **removes** any locked-family key the document doesn't supply, so a hand-typed `duration` on an article doesn't survive.

### 2.4 Jobs and requests
- `JobStatus` gains `'fetching'` (between `queued` and `summarizing`, articles only).
- `Job` gains `source_type: SourceType`, `feed_id: uuid | null`, `feed_name: string | null`.
- `CreateJobBody` gains `source_type?: SourceType` and `text?: string` (trimmed, `minPastedChars`–`maxChars`) and `title?: string` (trimmed, 1–300). Refinement: `text` and `title` only with an article (explicit or detected).
- `SubmitPastedTextBody = { text, title? }` (same rules) for `POST /api/jobs/:id/text`.
- `GetTranscriptResponse` is replaced by `GetSourceResponse = { source: SourceDocument }`.
- `DownloadFormat` unchanged; the server refuses `srt` and `txt` for articles (§6).

### 2.5 Settings
- `Settings` gains `feed_check_interval_minutes: 15 | 30 | 60 | 180 | 360 | 1440` (default 60, not seeded; the service falls back like `default_model`). `UpdateSettingsBody` accepts it.
- `GetSettingsResponse.locked_instructions` becomes `{ video: string, article: string }`.

### 2.6 Feeds and inbox (`feeds.ts`, new)
```ts
Feed = { id: uuid, url: url, feed_url: url, name: string, profile_id: uuid | null,   // null = default profile
         enabled: boolean, auto_summarize: boolean,
         last_checked_at: iso | null, last_error: string | null, last_skipped_count: int,
         inbox_count: int, created_at: iso }
FeedName = z.string().trim().min( 1 ).max( 100 )
PreviewFeedBody     = { url: url }
PreviewFeedResponse = { feed_url: url, title: string, latest_item: { title: string, published_at: iso | null } | null }
CreateFeedBody      = { url: url, name?: FeedName, profile_id?: uuid, auto_summarize?: boolean }
UpdateFeedBody      = { name?, profile_id?: uuid | null, enabled?, auto_summarize? }   // at least one
ListFeedsResponse   = { feeds: Feed[] }            // not deleted, by name
FeedResponse        = { feed: Feed }

FeedItem = { id: uuid, feed_id: uuid, feed_name: string, title: string, link: url,
             published_at: iso | null, source_type: SourceType, added_at: iso }
ListFeedItemsResponse = { items: FeedItem[] }      // status 'inbox' only, newest first
SummarizeFeedItemsBody = { ids: uuid[].min(1).max(50), model?: string, profile_id?: uuid }
SummarizeFeedItemsResponse = { jobs: Job[] }
DismissFeedItemsBody   = { ids: uuid[].min(1).max(200) }
```
Schema tests for each, as in 0.4.0.

## 3. Data (SQLite)

### 3.1 Migration 5 (a function migration)
```sql
ALTER TABLE jobs RENAME COLUMN transcript TO source_document;
UPDATE jobs SET source_document = json_set( source_document, '$.kind', 'video' )
  WHERE source_document IS NOT NULL;
ALTER TABLE jobs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'video';
ALTER TABLE jobs ADD COLUMN feed_id TEXT;          -- no foreign key, like summary_runs

CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,                 -- what Naresh entered
  feed_url TEXT NOT NULL,            -- after discovery and redirects
  name TEXT NOT NULL,
  profile_id TEXT,                   -- NULL = default profile at summarize time
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_summarize INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  last_modified TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  last_skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX feeds_active_url ON feeds ( feed_url ) WHERE deleted_at IS NULL;

CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds ( id ),
  item_key TEXT NOT NULL,            -- §5.4
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  published_at TEXT,
  author TEXT,
  content_markdown TEXT,             -- full text from the feed, when it passes the threshold
  status TEXT NOT NULL,              -- 'baseline' | 'inbox' | 'dismissed' | 'queued' | 'skipped'
  job_id TEXT,
  added_at TEXT NOT NULL,
  UNIQUE ( feed_id, item_key )
);
CREATE INDEX feed_items_inbox ON feed_items ( status, added_at );
```
Tested from `user_version = 4` with a job in review and a saved job: the review job's source parses as a `video` `SourceDocument`, its note is untouched, `source_type` is `video`. Also from an empty database.

`content_markdown` is dropped (set NULL) when an item leaves the inbox, to keep the table small; the row stays so the item is never seen again.

### 3.2 Repositories
- `jobStore.repository.ts`: `transcript` → `source_document` (parsed as `SourceDocument`), plus `source_type` and `feed_id`. `listActiveJobs` joins `feeds` for `feed_name` (deleted feeds keep their name).
- `feeds.repository.ts` (new): `listFeeds()`, `findFeedById( id )` (deleted too), `findActiveFeedByFeedUrl`, `insertFeed`, `updateFeed`, `markFeedDeleted`, `listDueFeeds( now, intervalMinutes )` (enabled, not deleted, never checked or checked before `now - interval`), `recordCheck( id, { etag, last_modified, last_checked_at, last_error, last_skipped_count } )`.
- `feedItems.repository.ts` (new): `insertItemIfNew( item ): boolean` (`INSERT … ON CONFLICT DO NOTHING`), `listInbox()`, `findItemsByIds( ids )`, `setItemStatus( ids, status, jobId? )` (clears `content_markdown` when not `inbox`), `countInbox( feedId )`, `dismissInboxForFeed( feedId )`.
- Synchronous free functions on `getDatabase()`, no rules, as before. Update `apps/server/CLAUDE.md` repositories line.

## 4. Server: sources

### 4.1 Adapter interface (`src/sources/`, new folder)
```ts
interface AdapterContext { job: Job, workDir: string, markStatus: ( status: StepStatus ) => void }
interface SourceAdapter { acquire( ctx: AdapterContext ): Promise< SourceDocument > }
```
- `sources/video.adapter.ts`: today's body of `runJob` (download with the 403 retry, convert, transcribe), returning a `video` document. Behaviour-neutral refactor; the existing `runJob` tests keep passing.
- `sources/article.adapter.ts`: marks `fetching`, then `fetchArticle( job.url )` (§4.3).
- `sources/text.ts`: `articleFromText( { url, text, title?, origin, author?, site?, published? } ): ArticleSource`. Used for pasted text and full-text feed items, synchronously at queue time. Title: the given title, else the first Markdown heading, else the first non-empty line cut to 120 characters, else the URL's hostname.
- `sources/index.ts`: `adapterFor( sourceType )`.
- `runJob` becomes: summarizing → `summarizeJob` (as now); otherwise `adapterFor( job.source_type ).acquire(…)` → `completeAcquisition( id, document )` → `summarizeJob`. Errors → `failJob` as now. The work folder is created and removed only for videos.
- Add `src/sources/` to `apps/server/CLAUDE.md` ("adapters that turn a job into a `SourceDocument`").

### 4.2 HTTP client (`clients/http.client.ts`, new)
`fetchResource( url, { accept, maxBytes, timeoutMs, etag?, lastModified? } )` on Node's `fetch`:
- `redirect: 'manual'`, following at most 5 redirects itself; http(s) only at every hop.
- `User-Agent: Mnemosyne/<version> (personal reader)`, the version from the server's `package.json`.
- Reads the body as a stream and aborts past `maxBytes`.
- Returns `{ status, finalUrl, contentType, body: string, etag, lastModified }`; `304` returns with an empty body. Decodes with the charset from `Content-Type`, defaulting to UTF-8.
- Typed errors for the PRD messages: `UnreachableError` ("Couldn't reach the site"), `HttpStatusError` (401/403/402 → "The page needs a login or is paywalled"; other 4xx/5xx → "The site answered <status>"), `TooLargeError`, `RedirectError`.
- Tests with a local `http.createServer` on port 0: redirects (count and protocol), size cap, timeout, charset, 304.

### 4.3 Article extraction (`sources/extractArticle.ts`, new)
`fetchArticle( url )`: `fetchResource` (Accept `text/html,application/xhtml+xml`, 5 MB, 15 s) → refuse non-HTML content types ("Not an article page") → `extractArticle( html, finalUrl )`.

`extractArticle( html, baseUrl )` (pure, fixture-tested):
1. `parseHTML` from linkedom. Insert `<base href="<baseUrl>">` into `<head>` before parsing so relative links resolve; test that a relative link comes out absolute. If Readability can't run on linkedom for a fixture, stop and ask (ADR 0031 names jsdom as the fallback).
2. `new Readability( document ).parse()`. `null` → "Not an article page".
3. `htmlToMarkdown( article.content )` (§4.4).
4. Shorter than `minExtractedChars` → "Not an article page"; longer than `maxChars` → "Article is too long to summarize (<n> characters, limit 300,000)".
5. Meta: `title` = Readability title, else `<title>`, else hostname; `author` = `byline`; `site` = `siteName`, else hostname; `published` = `publishedTime` cut to `YYYY-MM-DD` when it parses as a date, else null.

Fixtures under `apps/server/src/test-support/articles/`: a blog post, a Medium-style post, a Substack post, a page with almost no text, a page with relative links. Saved HTML files trimmed by hand; no network in tests.

### 4.4 HTML to Markdown (`sources/htmlToMarkdown.ts`, new)
turndown with `headingStyle: 'atx'`, `bulletListMarker: '-'`, `codeBlockStyle: 'fenced'`, `emDelimiter: '*'`. Rules: remove `img`, `picture`, `figure` (keeping `figcaption` text as a paragraph), `table`, `iframe`, `script`, `style`, `svg`, `video`, `audio`, `form`, `button`. Then collapse three or more newlines to two and trim. Pure, fixture-tested.

### 4.5 Jobs service changes
- `queueJob( body )` takes the parsed `CreateJobBody`: `source_type` = body's or `detectSourceType( url )`. With `text`: build the document with `articleFromText`, store it, status `summarizing`, title set. Otherwise `queued`. `feed_id` optional (used by the inbox, not the API).
- `markStatus`: allowed steps depend on `source_type`: video `queued → downloading → converting → transcribing`; article `queued → fetching`.
- `completeTranscription` is renamed `completeAcquisition( id, document )`: allowed from `transcribing` (video) or `fetching` (article); stores the document and title, moves to `summarizing`.
- `submitPastedText( id, { text, title? } )` (new): only for an article job in `failed`; builds the document (`origin: 'pasted'`), clears `error`, moves to `summarizing`. Profile and model stay. Other states → 409.
- `getTranscript` → `getSource`; `findTranscript` → `findSource`. `completeSummary`, `updateDraft` and `saveJob` use `lockedPropertiesFor( document, created )` instead of building `channel` / `duration` themselves.
- `renderTranscript( id, format )`: for articles `md` returns `# <title>\n\n<source URL>\n\n<markdown>`; `srt` and `txt` → `ConflictError( 'Only Markdown is available for articles' )`.
- `toPublicJob` adds `source_type`, `feed_id`, `feed_name`.
- `recoverInterruptedJobs` treats `fetching` like the other in-flight steps.

## 5. Server: summarizer for articles

### 5.1 Locked instructions (`summarizer/prompts.ts`)
`LOCKED_INSTRUCTIONS` is renamed `LOCKED_INSTRUCTIONS_VIDEO`, text unchanged. New `LOCKED_INSTRUCTIONS_ARTICLE`, exactly:

```
You summarize an article for a personal Obsidian vault.

The article is given in Markdown.

Your output has four parts:
- overview: the main summary, in Markdown. Use paragraphs, bullet lists and bold lead-ins. Do not use headings, tables, images or code blocks; the app adds the headings.
- key_points: the most useful points, in the order they come up. Each is one or two sentences on a single line.
- quotes: notable sentences copied word for word from the article, without Markdown formatting. A quote that is not word for word is discarded.
- tags: 3 to 5 short topical tags, lowercase, without the # sign.

Use only what the article says. When you add your own judgement, label it as your inference.
The guidance below may talk about videos; apply it to this article the same way.
Follow the guidance below on what to focus on and how to frame it. If it conflicts with the rules above, the rules above win.
```
`buildSystemPrompt( guidance, kind )` picks the locked text by kind; the `<guidance>` wrapping is unchanged.

### 5.2 Claude client
- `summarizeTranscript` is renamed `summarizeSource( { document, model, guidance } )`.
- Video: as today (`SummaryResult`, `[seconds] text` lines).
- Article: user message = `# <title>\n\n<markdown>`; output format `ArticleSummaryResult = { overview: string, key_points: string[], quotes: string[], tags: string[] }`.
- Returns `{ summary: { kind: 'video', …SummaryResult } | { kind: 'article', …ArticleSummaryResult }, usage }`. `SummaryError`, effort, max tokens and usage handling unchanged.

### 5.3 Clean-up and formatting
- `cleanSummary( summary, document )` branches on kind. Article: tags as today; quotes kept only when `normalizeForQuote( quote )` is a substring of `normalizeForQuote( article markdown )`, where `normalizeForQuote` strips Markdown emphasis and code marks (`*`, `_`, `` ` ``), link syntax (keeps the link text), turns curly quotes and apostrophes straight, then `cleanText`. Key points are kept as they are (they aren't quotes).
- `formatSummary( summary, document )`: video unchanged; article writes `- <point>` and `> "<quote>"` with no stamps.
- `summarizeJob` uses `getSource`, passes the kind through, and records runs exactly as today.

### 5.4 Settings
`GET /api/settings` returns both locked texts; the settings service reads `feed_check_interval_minutes` with the fallback 60.

## 6. Server: feeds

### 6.1 Parsing and discovery (`sources/feeds.ts`, new)
- `parseFeedXml( xml )`: feedsmith's parser for RSS, Atom and RDF (and JSON Feed if it supports it). Normalizes to `{ title, items: { guid, link, title, published_at, author, content_html }[] }`. Items without a link are dropped. Fixture-tested: an RSS 2.0 blog with `content:encoded`, an Atom feed, a Medium feed, a Substack feed, a YouTube channel feed.
- `discoverFeed( url )`: `fetchResource` (Accept `application/rss+xml, application/atom+xml, application/xml, text/xml, text/html`, 2 MB, 15 s). If the body parses as a feed, use it. If it is HTML, take the first `<link rel="alternate">` whose type is `application/rss+xml`, `application/atom+xml` or `application/feed+json`, resolve it against the final URL, fetch and parse that. Otherwise `ValidationError( 'No feed found at this address' )`.

### 6.2 Items
- **Item key:** the GUID / Atom id when present; else the link with the fragment removed; else `sha256( title + published_at )`.
- **Source type:** `detectSourceType( link )`.
- **Content:** for article items, `content_html` through `htmlToMarkdown`; kept as `content_markdown` only when it is at least `minExtractedChars` and at most `maxChars`, else null (the link is fetched instead).
- **Published:** the item's date as ISO, null when missing or invalid.

### 6.3 Feeds service (`services/feeds.service.ts`, new)
- `previewFeed( url )` → `discoverFeed`, returns `PreviewFeedResponse`.
- `createFeed( body )`: discover; 409 if an active feed has the same `feed_url`; validate `profile_id` with `assertActiveProfile`; insert; then **baseline**: every current item inserted as `baseline`, except the newest (by `published_at`, else feed order) inserted as `inbox` — or queued straight away if `auto_summarize` (§6.4). Records the check.
- `updateFeed`, `deleteFeed( id, { removeInboxItems } )` (soft delete; with the flag, inbox items become `dismissed`).
- `checkFeed( id )`: fetch `feed_url` with the stored ETag / Last-Modified. `304` → record the check only. Otherwise parse; for each item in feed order, `insertItemIfNew`; new items up to **10 per check** become `inbox` (or are queued if `auto_summarize`); the rest are inserted as `skipped` and counted in `last_skipped_count`. Any error → `last_error` = its message, the check time recorded, nothing else changed. A successful check clears `last_error`.
- `checkDueFeeds()`: `listDueFeeds` then `checkFeed` one at a time; one feed's error never stops the rest.

### 6.4 Inbox service (`services/feedInbox.service.ts`, new)
- `listInbox()`.
- `summarizeItems( { ids, model?, profile_id? } )`: every id must be an `inbox` item, else 409 listing the bad ones; nothing is queued unless all are valid. For each, `queueJob` with the item's link, `source_type`, `feed_id`, `profile_id` = body's, else the feed's, else none (the default); `model` = body's, else none. Article items with `content_markdown` are queued with that text as an article document (`origin: 'feed'`, author from the item, site = feed name, published from the item); others go through the article or video adapter. Items become `queued` with their `job_id`. Done in one transaction for the item updates.
- `dismissItems( ids )`: `inbox` items become `dismissed`; ids not in the inbox are ignored.
- The auto-summarize path in `checkFeed` calls the same queueing function with no overrides.

### 6.5 Poller (`worker/feedPoller.ts`, new)
`startFeedPoller()`: every 60 seconds, if no pass is running, `checkDueFeeds()` with the interval from settings. Returns a stop function that clears the timer and awaits the running pass. Wired in `server.ts` and `shutdown.ts` beside the worker and sweeper. Fake-timer tests: no overlapping passes, stop awaits the pass, the interval setting is read on every tick.

## 7. API (new and changed)
| Method | Path | Body / query | Response | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/jobs` | `CreateJobBody` (now with `source_type?`, `text?`, `title?`) | `CreateJobResponse` | 400 |
| GET | `/api/jobs/:id/source` (replaces `/transcript`) | | `GetSourceResponse` | 404, 409 not ready |
| GET | `/api/jobs/:id/download?format=` | | file | 409 `srt`/`txt` for articles |
| POST | `/api/jobs/:id/text` (new) | `SubmitPastedTextBody` | `{ job }` | 400, 404, 409 not a failed article |
| GET | `/api/feeds` | | `ListFeedsResponse` | |
| POST | `/api/feeds/preview` | `PreviewFeedBody` | `PreviewFeedResponse` | 400 no feed, 502 unreachable |
| POST | `/api/feeds` | `CreateFeedBody` | `FeedResponse` (201) | 400, 409 duplicate, 502 |
| PATCH | `/api/feeds/:id` | `UpdateFeedBody` | `FeedResponse` | 400, 404 |
| DELETE | `/api/feeds/:id?remove_items=true\|false` | | 204 | 404 |
| POST | `/api/feeds/:id/check` | | `FeedResponse` (after the check; a failed check is 200 with `last_error`) | 404 |
| POST | `/api/feeds/check` | | `ListFeedsResponse` | |
| GET | `/api/feed-items` | | `ListFeedItemsResponse` | |
| POST | `/api/feed-items/summarize` | `SummarizeFeedItemsBody` | `SummarizeFeedItemsResponse` | 400, 409 |
| POST | `/api/feed-items/dismiss` | `DismissFeedItemsBody` | 204 | 400 |

Routes, controllers and error mapping follow the existing pattern (`routes/*.routes.ts`, `controllers/*.controller.ts`, `errors.ts`). A new `BadGatewayError` (502) in `errors.ts` for unreachable sites during preview and create.

## 8. Web

### 8.1 Data layer
- `api/jobs.api.ts`: `createJob( body: CreateJobBody )`, `getSource( id )` (replaces `getTranscript`), `submitPastedText( id, body )`.
- `api/feeds.api.ts` (new) and `api/feedItems.api.ts` (new) for §7.
- Hooks: `useSource` (replaces `useTranscript`), `useSubmitPastedText`, `useFeeds`, `useFeedMutations` (create, update, delete, check), `useFeedPreview`, `useFeedInbox` (refetch every 60 s and on window focus), `useSummarizeFeedItems`, `useDismissFeedItems`. Summarizing items invalidates `['jobs']` and the inbox; feed changes invalidate `['feeds']` and the inbox. Keys in `queryKeys.ts`.

### 8.2 Submit form
- The field is labelled "URL", placeholder `https://…`, form name "Add a video or article".
- `SourceTypeSwitch` (new): a `ToggleButtonGroup` "Video" / "Article" under the field, showing `detectSourceType( url )` until Naresh clicks it; once clicked, his choice holds until the URL field is cleared. Hidden while the field is empty.
- **Paste text instead** (a `Button variant="text"`, shown for articles): reveals an optional "Title" field and a multiline "Article text" field (min 10 rows) with a character count against `maxChars`, and a short-text message below `minPastedChars`. Collapsing it clears the text.
- Submit label: "Transcribe" for video, "Summarize" for article. `SummaryOptions` unchanged. `HomePage` sends `source_type` only when it differs from the detected one.
- `SubmitForm.tsx` stays under about 150 lines: the paste section is its own component, `PastedTextFields`.

### 8.3 Job progress and failure
- `JobProgress` shows "Fetching the article" for `fetching` and leaves out the download/convert/transcribe steps for articles.
- A failed article job shows **Paste text** (with the error), which opens `PasteTextDialog` (new; the same fields as §8.2, reusing `PastedTextFields`) and calls `useSubmitPastedText`; on success the page follows the job into summarizing.

### 8.4 Review screen
- `TranscriptPane` is renamed `SourcePane`. For videos it is unchanged (including caret-sync scrolling). For articles it shows the title, a link to the source, and the Markdown as read-only text (`Typography component="pre"`, `whiteSpace: 'pre-wrap'`, body font, not monospace), scrollable like the transcript.
- `PropertiesPanel` shows Author, Site and Published (read-only, each only when present) for articles instead of Channel and Duration.
- `DownloadLinks` offers only Markdown for articles.
- The job list and the review screen show the feed name (`Chip size="small"` with an RSS icon) for feed jobs, and a small video or article icon for every job.

### 8.5 Settings → Feeds
- `SettingsPage` gets a second section, **Feeds**, below Summarizer.
- `FeedSettings` (new): "Check feeds every" `TextField select` (15 min … daily), saved at once like the summarizer defaults; **Check all now**.
- `FeedList` (new): one row per feed with the name, the feed URL (secondary text), the profile ("Default profile" when null), "Checked <relative time>", inbox count, the `last_error` as an `Alert severity="warning"`, "<n> skipped in the last check" when non-zero, an **On** `Switch`, an **Auto** `Switch` labelled "Summarize automatically", and a menu with **Check now**, **Edit**, **Delete**.
- `AddFeedDialog` (new): URL field → **Find feed** calls preview and shows the feed title, the resolved feed URL and the latest item → Name (prefilled from the title), Prompt profile, Summarize automatically → **Add**. Errors from preview or create shown in the dialog. `EditFeedDialog` reuses its fields without the URL step.
- `DeleteFeedDialog`: confirm, with a checkbox "Also remove its <n> items from the inbox" (shown when the count is non-zero).

### 8.6 Home page inbox
- `FeedInbox` (new), on the home page above the job list, hidden when the inbox is empty: heading "From feeds (<n>)", a list with a checkbox per item, the feed name, the title as a link to the original (new tab), the date and a video or article icon; a select-all checkbox; **Summarize** and **Dismiss** for the selection. Each row also has its own Summarize and Dismiss icon buttons.
- **Summarize** opens `SummarizeItemsDialog` (new): Prompt profile select with a first option "Each feed's profile" (the default choice, sending no `profile_id`), Model select (default model), and the count. Confirm calls `useSummarizeFeedItems`; the new jobs appear in the job list.

### 8.7 Caret sync (ADR 0033)
1. **Set up browser mode.** A second Vitest project in `apps/web/vite.config.ts` named `browser`: `include: [ 'src/**/*.browser.test.tsx' ]`, provider `playwright()` from `@vitest/browser-playwright`, instances `chromium` and `webkit`, headless. The existing jsdom project excludes `*.browser.test.tsx`. Scripts: `test` stays jsdom only; new `test:browser` runs the browser project. One-time setup in the README: `pnpm --filter web exec playwright install chromium webkit`.
2. **Reproduce.** `ReviewScreen.browser.test.tsx` renders the real review screen (API modules mocked as in the jsdom tests, real MDXEditor, real DOM selection) with a note containing timestamps and a long transcript, then in rich mode clicks inside a timestamp and asserts the transcript scrolled to and highlighted that segment; the same in source mode with the cursor moved by arrow keys. Commit the test **failing** (marked `it.fails` so the suite is green) with a log line describing how it fails.
3. **Diagnose and fix.** Find the actual cause (for example the selection event not reaching `onCaretText`, the block text not matching `parseTimestampSeconds`, or the scroll container being the wrong element) and fix it. Remove `it.fails`. Record the cause and fix in the next-numbered ADR.
4. From this checkpoint on, every web task's gate includes `test:browser` (update `apps/web/CLAUDE.md`).

## 9. Tests
- **Test-first** as always. Every existing test passes unchanged except: renames in §4.1, §4.5, §5.2 and §8.4 (`Transcript` → `SourceDocument` where the job's source is meant, `getTranscript` → `getSource`, `completeTranscription` → `completeAcquisition`, `summarizeTranscript` → `summarizeSource`, `TranscriptPane` → `SourcePane`, `useTranscript` → `useSource`), fixtures that gain `kind: 'video'` or the new job fields, and the transcript endpoint path. List each change in the task's log line.
- **Shared:** schemas in §2, `detectSourceType` table, note serialization (video fixtures byte-identical; article keys order; unknown locked keys removed).
- **Server:**
  - migration 5 from `user_version = 4` and from empty (§3.1);
  - repositories: item dedupe per feed, inbox listing, content cleared on status change, due feeds;
  - `http.client` against a local server (§4.2); `extractArticle` and `htmlToMarkdown` on fixtures; `articleFromText` titles;
  - adapters: video adapter = old `runJob` behaviour; article adapter status and errors;
  - jobs service: step rules per source type, `completeAcquisition`, `submitPastedText` rules, locked properties per kind, article downloads;
  - Claude client: article system prompt, user message and output format; `cleanSummary` quote normalization cases; `formatSummary` article output;
  - feeds: `parseFeedXml` fixtures, discovery (feed URL, HTML with link, HTML without), baseline on create, the 10-item cap and skipped count, 304 handling, errors recorded, `auto_summarize`, delete with and without removing items;
  - inbox: all-or-nothing validation, profile resolution order, full-text items queued as summarizing, others queued;
  - poller with fake timers;
  - every endpoint in §7 through `app.ts` with Supertest, including each error status. No test touches the network.
- **Web:** hooks and `api/` modules as in 0.4.0; `SourceTypeSwitch` (detect, override, reset on clear), `PastedTextFields` (limits), `SubmitForm` labels per type, `JobProgress` for articles, `PasteTextDialog`, `SourcePane` article view, `PropertiesPanel` article fields, `DownloadLinks` for articles, `FeedList`, `AddFeedDialog` (preview, errors, add), `DeleteFeedDialog`, `FeedInbox` (selection, summarize dialog, dismiss), feed chip in the job list; the caret-sync browser tests (§8.7).
- **Browser checks** (as `apps/web/CLAUDE.md` requires), light and dark: submit form with the switch and paste box, an article in review, a failed article with Paste text, Settings → Feeds with the add dialog, the home-page inbox.
- **Real check** (needs Naresh): one real article URL; one paywalled article through Paste text; add two real feeds (a blog with full text and a Medium or Substack feed) and a YouTube channel; check the baseline item, **Check now**, Summarize from the inbox with a different profile, Dismiss; caret sync on a real video in Chrome and Safari.

## 10. Phases (detail in `tasks.md`)
1. **Kick-off:** ADRs indexed and accepted.
2. **Shared contracts.**
3. **Server data:** migration 5, repositories.
4. **Adapter refactor:** video path behind the adapter interface, no behaviour change.
5. **Caret sync:** browser mode, reproduce, fix.
6. **Server articles:** HTTP client, extraction, text documents, jobs service, summarizer for articles, endpoints.
7. **Web articles:** submit form, progress and paste dialog, review screen.
8. **Server feeds:** parsing and discovery, feeds and inbox services, poller, endpoints.
9. **Web feeds:** data layer, Settings → Feeds, home-page inbox.
10. **Clean-up and verification:** docs, versions 0.5.0, final checks, release notes.

Checkpoints (agreed): **A** = phases 1–4, **B** = phase 5, **C** = phase 6, **D** = phase 7, **E** = phase 8, **F** = phase 9, **G** = phase 10.

## 11. ADRs (new, drafted with this TRD)
- 0030 Source adapters and intakes: one `SourceDocument` for every source
- 0031 Article extraction: Readability on linkedom, turndown to Markdown, fetch limits
- 0032 RSS feeds with feedsmith, an inbox before summarizing, and a separate poller
- 0033 Browser-mode tests with Vitest and Playwright for real-DOM behaviour

## 12. Open questions
None.
