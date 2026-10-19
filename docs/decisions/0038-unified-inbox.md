# 0038. One inbox for feed items and newsletter emails

- Status: Accepted
- Date: 2026-10-19

## Context
0.5.0's home page has a **From feeds** inbox backed by `feed_items` and `/api/feed-items`. v0.6.0 adds newsletter emails that wait the same way. Two inboxes would split one decision ("what's worth summarizing?") across two lists.

## Decision
- **One Inbox** on the home page, newest first, each item labelled with its feed or Gmail source.
- **Storage stays separate:** `feed_items` unchanged; newsletter emails live in `gmail_messages` with status `inbox`. No table rebuild.
- **One API:** `GET /api/inbox`, `POST /api/inbox/summarize`, `POST /api/inbox/dismiss`, taking typed references `{ kind: 'feed' | 'gmail', id }`. `/api/feed-items` and the `FeedItem` contracts are removed (the web was their only consumer).
- `services/inbox.service.ts` replaces `feedInbox.service.ts`, keeping `queueFeedItem` and adding `queueNewsletterMessage`.
- A summarize request over several items returns the jobs that succeeded; it fails as a whole only when every item failed.

## Consequences
- A third intake later adds a kind and a mapper, not a new screen.
- The inbox query reads two tables; fine at one user's volume.
- A breaking API change, internal to the app.

## Alternatives considered
- **Generalize `feed_items` into `inbox_items`:** one table, but SQLite needs a table rebuild to make `feed_id` nullable, and email rows have different fields.
- **A separate newsletter inbox:** no API change, but two lists for one task.
