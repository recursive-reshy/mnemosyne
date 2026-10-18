# Mnemosyne v0.5.0 — Release notes

Not yet released. Set the date and tag `v0.5.0` when the real check (tasks 10.3) is confirmed.

v0.5.0 makes Mnemosyne read more than videos. You can summarize an article from its URL, paste the text of one the app can't read, and subscribe to RSS or Atom feeds so new posts wait for you in an inbox. Every source now goes through one internal "source adapter" contract, ready for a Gmail adapter later. The release also fixes timestamp caret sync on the review screen, a known issue since 0.3.0.

## New

### Articles
- The submit field is now **URL**. A **Video / Article** switch under it shows what the host suggests (YouTube and the other yt-dlp hosts are videos, everything else an article); click it to override. The button reads Transcribe or Summarize.
- An article job runs queued → fetching → summarizing → ready for review. The server fetches the page itself (no login, no scripts), extracts the main text and stores it as Markdown. The review screen shows the article's title, link and text beside the note; the note has no timestamps and quotes must still be word for word.
- Article notes carry `author`, `site` and `published` (each only when known) in the front-matter instead of `channel` and `duration`. Settings shows the fixed instructions for videos and for articles, read-only.
- Articles over 300,000 characters fail with a clear message instead of being cut. Pages that aren't articles, need a login or can't be reached fail with a plain reason.

### Pasted text
- **Paste text instead** on the submit form takes the article's text (and an optional title); the URL stays as the note's source and nothing is fetched. On a failed article job, **Paste text** continues that job with the text you paste, keeping its URL, profile and model.

### Feeds and the inbox
- **Settings → Feeds**: add a feed from a feed address or a page that links to one, see its title and latest item first, choose its prompt profile and whether it summarizes automatically, and switch it on or off. Choose how often feeds are checked (15 minutes to daily, default hourly) or **Check all now**.
- Adding a feed doesn't import its back catalogue: only its newest item goes to the inbox. A check adds at most 10 new items per feed; the rest are marked seen and skipped, and the feed says how many. An item already seen is never added again. A failing feed shows its error and keeps being retried.
- New items wait in a **From feeds** inbox on the home page. **Summarize** (one item or a selection, with the profile and model you choose, or each feed's profile) turns them into normal jobs; **Dismiss** removes them. Nothing is fetched or summarized while an item waits. Jobs from a feed show the feed's name.
- A feed with full text in its items uses it; otherwise the link is fetched as for any article. A YouTube channel's feed produces video jobs.

### Caret sync
- Clicking a timestamp in the note, or moving the cursor onto one, scrolls the transcript there again. The 0.3.0 failure didn't reproduce in a real browser in 0.5.0 work; the real defects the browser tests found were fixed instead (a paragraph starting at a fractional second was one off, and the front-matter `duration` line was read as a timestamp). Real-browser tests now run in Chromium and WebKit.

## Changes
- `GET /api/jobs/:id/transcript` is now `GET /api/jobs/:id/source`, returning a `SourceDocument` (a video transcript or an article).
- `locked_instructions` in `GET /api/settings` is now `{ video, article }`.
- Jobs have `source_type`, `feed_id` and `feed_name`, and a new `fetching` status. The stored `transcript` column is now `source_document`.
- New endpoints: `POST /api/jobs/:id/text`, the feed endpoints under `/api/feeds` and the inbox endpoints under `/api/feed-items`. `POST /api/jobs` accepts `source_type`, `text` and `title`.
- The server's JSON body limit is 2 MB (for pasted text), with a 413 for anything larger.
- Article jobs offer only the Markdown download (no SRT or TXT).

## Upgrading
1. **Back up your database first.** Migration 5 renames a column and adds tables and columns; a backup lets you go back.
   ```bash
   docker compose stop
   mkdir -p ~/mnemosyne-backup
   docker run --rm -v mnemosyne_mnemosyne-data:/data -v ~/mnemosyne-backup:/backup alpine sh -c 'cp /data/mnemosyne.db* /backup/'
   ```
2. Rebuild: `docker compose up -d --build`.
3. On startup the database migrates from version 4 to version 5. Existing jobs and notes are untouched. The migration was run against a copy of the real 0.4.0 database before release: it reached version 5 with the saved job, the three prompt profiles and the settings unchanged, and the new feed tables empty. That database held only a saved job (its transcript was deleted on save), so the renamed transcript column is covered by the migration tests, not by that copy.
4. No configuration changes are needed. There are no new environment variables.
5. For development only: install the test browsers once with `pnpm --filter web exec playwright install chromium webkit`, then `pnpm --filter web test:browser` runs the real-browser tests.

## Known issues
- **Pages that need JavaScript or a login can't be read.** The server doesn't run scripts or log in. Use Paste text.
- **A feed check adds at most 10 new items per feed.** A feed that republishes its history has the rest skipped, as designed. A new feed's newest item is already in the inbox, so a first check can leave 11.
- **The failed-article screen still says "Transcribe another video"** on its button.
- **Feed relative times** ("Checked 5m ago") refresh when the feed list reloads, not every second.
- **The web bundle is about 1.5 MB**, mostly the editor (lazy-loading it is a follow-up).
- Costs are estimates from a price table in the app, as in 0.4.0.

## Under the hood
- `SourceDocument` is one union (`video` or `article`) behind a `SourceAdapter` contract; the worker runs an adapter, then summarizes. A Gmail adapter means adding an adapter, not changing the job, summary or review code.
- Server: `clients/http.client.ts` (redirects, size and time limits, typed errors), `sources/` (adapters, Readability on linkedom, turndown, feed parsing with feedsmith), `services/feeds.service.ts`, `services/feedInbox.service.ts`, and a feed poller beside the worker and sweeper (60-second ticks, no overlapping passes).
- New dependencies: feedsmith, @mozilla/readability, linkedom, turndown (server); @vitest/browser-playwright and playwright (web, dev).
- Tests at release: 323 shared, 1098 server and 851 web unit tests, 18 browser tests (Chromium and WebKit), with lint, typecheck and builds clean.

## Decisions
New ADRs: [0030](../decisions/0030-source-adapters-and-intakes.md) source adapters and intakes (amends 0014 and 0015) · [0031](../decisions/0031-article-extraction.md) article extraction · [0032](../decisions/0032-rss-feeds-inbox-poller.md) RSS feeds, inbox and poller · [0033](../decisions/0033-browser-mode-tests.md) browser-mode tests · [0034](../decisions/0034-caret-sync-paragraph-and-front-matter.md) caret sync fixes. None changes the TRD.
