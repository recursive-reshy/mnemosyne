# 0032. RSS feeds with feedsmith, an inbox before summarizing, and a separate poller

- Status: Accepted
- Date: 2026-10-18

## Context
Naresh wants new posts from the blogs and newsletters he follows to reach Mnemosyne without pasting links. Most publish RSS or Atom feeds, readable with no account. Feed items arrive when he isn't looking, every summary costs tokens, a YouTube channel feed means a full transcription per item, and unreviewed jobs expire after 24 hours.

## Decision
- **Parse feeds with `feedsmith`** (RSS, Atom, RDF), fetched through the app's own `http.client` with ETag / If-Modified-Since. A page URL is resolved to its feed through `<link rel="alternate">`.
- **An inbox before summarizing.** New items are stored in `feed_items` with status `inbox` and wait on the home page with Summarize and Dismiss. Nothing is fetched, transcribed or summarized until Naresh picks an item. A per-feed **Summarize automatically** switch (off by default) skips the inbox.
- **Inbox items don't expire.** A job made from one follows the normal 24-hour review expiry.
- **Seen forever.** Every item is kept with a per-feed key (GUID, else link, else a hash of title and date), so an item is never added twice, even after it is dismissed or summarized. Its full-text content is cleared once it leaves the inbox.
- **No back catalogue.** When a feed is added, its current items are stored as `baseline` (seen, hidden), except the newest, which goes to the inbox so the feed visibly works. This doesn't depend on publish dates.
- **A cap of 10 new items per feed per check.** Items over the cap are stored as `skipped` and counted on the feed.
- **Full text from the feed when it is long enough** (the article threshold from ADR 0031), otherwise the item's link goes through the article adapter. Video links go through the video adapter.
- **A feed poller beside the worker and sweeper**, not inside the job worker, ticking every minute and checking due feeds one at a time at the interval set in Settings (default hourly). Feeds are soft-deleted, like prompt profiles, so their jobs keep the feed's name.

## Consequences
- Nothing is spent without a choice, unless a feed is set to automatic.
- `feed_items` grows without limit, but rows are small once content is cleared; fine at one user's volume.
- A feed with wrong or missing GUIDs may show an edited post again under a new key; accepted.
- A long transcription never delays feed checks.

## Alternatives considered
- **`rss-parser`:** well known, but its last release was in April 2023 and it depends on `xml2js`.
- **`@extractus/feed-extractor`:** maintained, but does its own fetching, while the app needs its own limits and conditional requests.
- **Summarize every item automatically:** simpler, but spends tokens on unwanted items and can flood the review queue, where items expire.
- **Import the back catalogue by date:** depends on feed dates, which are often missing or wrong, and floods the inbox on add.
- **Checking feeds inside the job worker:** one loop instead of two, but a two-hour transcription would delay every feed.
