# Mnemosyne v0.6.0 — Release notes

Not yet released. Set the date and tag `v0.6.0` when you are ready.

v0.6.0 connects Mnemosyne to Gmail. You connect your account once from Settings (read-only), define sources that match emails by Gmail label or search, and new matching emails wait in the Inbox on the home page beside feed items. Summarizing an email turns it into a normal note. Freelance job-alert intake and the Freelance jobs page were planned for this version and are **deferred** to a later one (ADR 0041).

## New

### Gmail connection
- **Settings → Gmail** has a **Connect Gmail** button that sends you through Google's consent screen for read-only access (`gmail.readonly`). Mnemosyne never changes your mailbox.
- The server runs the OAuth flow and keeps the refresh token in the database, encrypted (AES-256-GCM) with a key from `.env`, so a copy of the database is useless without it. It reads Gmail in the background with no browser open.
- **Disconnect** revokes the access at Google and deletes the stored token; sources and inbox items stay.
- When Google stops accepting the connection (access revoked, the app back in Testing, or the key changed) the section shows **Reconnect needed** with the reason, Gmail checks pause, and a warning dot appears on Settings in the navigation drawer. **Reconnect** resumes where it stopped.
- Gmail is optional. Without the client ID, secret and key the section says what is missing and the rest of the app works as before.

### Gmail sources
- A source matches by one or more labels (any of them) or by a Gmail search. **Preview** shows the match count, the newest subject and sender, and a warning when another source has the same rule.
- Newsletter options: prompt profile, **Summarize automatically**, and a **backfill** (none, last 30 or 90 days, or all, capped at 200 emails). Backfilled emails only land in the inbox and are never summarized automatically.
- Sources are checked on the feed interval, or with **Check now** and **Check all now**. A check adds at most 10 new emails per source; the rest are marked seen and skipped, and the source says how many. An email is never processed twice by the same source.
- Deleting a source asks whether to remove its inbox items.

### Newsletters and the Inbox
- The home-page **From feeds** inbox is now **Inbox** and shows feed items and newsletter emails together, newest first. Emails show the sender, a source chip and a link that opens the email in Gmail. Summarize and Dismiss work across both kinds; if some items in a batch fail, the others still go through and a message names the ones that stayed.
- Summarizing an email converts its whole body to Markdown (images, tracking, layout tables and the unsubscribe footer are dropped; ADR 0040) and queues a normal article job. The note's `source` links to the email, `author` is the sender, `site` is the source's name and `published` is the date received. An email with too little text, or over the length limit, can't be summarized and stays in the inbox.
- Jobs from Gmail show the source's name in the job list and on the review screen.

## Changes
- `GET`/`POST /api/feed-items` and its siblings are replaced by `GET /api/inbox`, `POST /api/inbox/summarize` and `POST /api/inbox/dismiss`, which take `{ kind: 'feed' | 'gmail', id }` items.
- New Gmail endpoints under `/api/gmail` (account, connect, OAuth callback, disconnect, labels, sources).
- `Job` gains `gmail_source_id` and `gmail_source_name`; `ArticleMeta.origin` gains `email`; `Settings` gains an `extraction_model` that nothing uses yet (see below).
- New optional environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`. A malformed `TOKEN_ENCRYPTION_KEY` stops the server at startup.
- The server refuses to create a Freelance jobs source (400), and the Add source form has no destination choice.

## Upgrading
1. **Back up your database first.** Migration 6 adds tables and a column; a backup lets you go back.
   ```bash
   docker compose stop
   mkdir -p ~/mnemosyne-backup
   docker run --rm -v mnemosyne_mnemosyne-data:/data -v ~/mnemosyne-backup:/backup alpine sh -c 'cp /data/mnemosyne.db* /backup/'
   ```
2. Rebuild: `docker compose up -d --build`. On startup the database migrates from version 5 to version 6; existing jobs, feeds, profiles and settings are untouched. The migration is covered by tests from version 5 (with a feed, an inbox item and a job in review) and from an empty database. As an extra check it was run on a copy of an older backup (version 3), which reached version 6 with its jobs, the three prompt profiles and the settings kept and the new tables empty.
3. **To use Gmail, do the one-time Google setup** in the README ([Google Cloud setup for Gmail](../../README.md#google-cloud-setup-for-gmail)): a Google Cloud project with the Gmail API, a Web client whose redirect URI is `http://localhost:3100/api/gmail/oauth/callback`, and the app published **In production** (in Testing, Google expires the token after 7 days). Then add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) to the `.env` at the repo root, run `docker compose up -d`, and press **Connect Gmail** in Settings. Skip this step if you don't want Gmail.
4. For development, the same variables go in `apps/server/.env`, with `GOOGLE_REDIRECT_URI=http://localhost:5173/api/gmail/oauth/callback` (and that URI added to the Google client).

## Deferred
- **Freelance job alerts** (Upwork, Freelancer.com): extraction into a postings dataset and a Freelance jobs page. Deferred until real alert emails exist to build against (ADR 0041, which keeps ADR 0037's design). Alerts that arrive before that version aren't collected, though it can backfill them from Gmail.
- The postings tables, the postings contracts and `extraction_model` are in the schema and code but unused, so the later version needs no migration edit.

## Known issues
- **A check reads the newest 100 emails in its window.** A burst of more than 100 unseen emails isn't read past the first 100.
- **With several labels, a 200-email backfill keeps the first 200 merged ids**, not the newest 200 overall.
- **An old email labelled long after it arrived is missed.** Checks look two days back from the source's start (ADR 0035).
- **Preview counts all matches**, not just the backfill window, so for a 30 or 90 day backfill the dialog gives a window and cap rather than an exact number.
- **Gmail is polled, not pushed**, on the feed interval.
- The Google Cloud console's menus change; the README's names (Branding, Audience, Data Access, Clients) may differ from what you see.
- Known from earlier versions: pages that need JavaScript or a login can't be read; the web bundle is about 1.5 MB; costs are estimates from a price table.

## Under the hood
- Server: `gmail/` (token cipher, OAuth, client wrapper, message parser, links, fixture scrubbing and stripping), `sources/emailToMarkdown.ts`, `services/gmailSources.service.ts` and `services/inbox.service.ts` (replacing `feedInbox.service.ts`), and an intake poller (`worker/intakePoller.ts`) that checks feeds, then Gmail sources.
- Web: `GmailSettings`, the sources list and its dialogs, and `Inbox` (replacing `FeedInbox`).
- New dependency: `@googleapis/gmail` (server). `google-auth-library` comes through its `auth` export.
- Newsletter tests run on five real emails saved with `pnpm --filter @mnemosyne/server fixture:gmail` and stripped to headers, bodies and host-only links. No test touches Gmail or the network.
- Tests at release: 411 shared, 1612 server and 1060 web unit tests, 18 browser tests (Chromium and WebKit), with lint, typecheck and builds clean.

## Decisions
New ADRs: [0035](../decisions/0035-gmail-intake.md) Gmail intake · [0036](../decisions/0036-newsletters-email-to-markdown.md) newsletters (amended by 0040) · [0037](../decisions/0037-job-postings-dataset.md) job postings (deferred) · [0038](../decisions/0038-unified-inbox.md) unified inbox (amends 0032) · [0039](../decisions/0039-feed-item-schemas-server-local.md) feed-item schemas, superseded · [0040](../decisions/0040-newsletters-whole-body.md) whole-body conversion (changes TRD §6.1) · [0041](../decisions/0041-defer-job-alert-intake.md) defer job alerts.
