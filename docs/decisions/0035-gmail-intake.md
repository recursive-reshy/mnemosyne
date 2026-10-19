# 0035. Gmail intake: `@googleapis/gmail`, server-side OAuth, an encrypted refresh token, and a date-window sync

- Status: Proposed
- Date: 2026-10-19

## Context
v0.6.0 reads Naresh's Gmail for two things RSS can't reach: email-only newsletters and freelance job alerts. Mnemosyne is a single-user app in Docker on his Mac with no login of its own. Gmail has to be read on a schedule by the server, including when no browser is open, and the access it holds is to his personal mailbox.

## Decision
- **Gmail API with OAuth 2.0, read-only scope** (`gmail.readonly`), using Google's per-API package `@googleapis/gmail`, which brings `google-auth-library` for token refresh and revocation. Not IMAP, not the full `googleapis` bundle.
- **The server is the OAuth client.** A **Connect Gmail** button in Settings starts the flow (`access_type=offline`, `prompt=consent`, a one-time `state` kept in memory for 10 minutes); Google redirects to `/api/gmail/oauth/callback` on the app's own localhost port. There is no app login; connecting is an authorization.
- **The refresh token is stored on the server, encrypted.** AES-256-GCM with Node's `crypto`, the key in `.env` as `TOKEN_ENCRYPTION_KEY` (32 bytes, base64), the ciphertext in a single-row `gmail_account` table. The access token is held in memory only. Neither is ever returned by the API or logged. A lost or changed key means **Reconnect needed**, not a crash.
- **Google client credentials in `.env`** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `GOOGLE_REDIRECT_URI`). Without them and the key, Gmail is "not configured" and the rest of the app works as before. The Google Cloud app must be **In production** status: in Testing, refresh tokens expire after 7 days.
- **Sources match by label IDs or a Gmail search.** Label IDs survive renames; several labels mean "any of them" (one list call per label, merged), because Gmail's `labelIds` filter means "all of them".
- **Date-window sync.** Each source has a `sync_from` time. A check lists matches `after: sync_from − 2 days` and skips messages already recorded for that source in `gmail_messages` (`UNIQUE ( source_id, message_id )`). No baseline rows; the date filter does what baselines do for feeds. Newsletter backfill is a one-off listing at creation, capped at 200.
- **Bodies are read with `format=full`** and Gmail's parsed MIME tree, so no MIME parser dependency.
- **An expired or revoked grant** (`invalid_grant`) sets the account to **Reconnect needed** and pauses Gmail checks.

## Consequences
- Background collection works with the browser closed, which is the point of job-alert intake.
- A copy of the database or data volume (as the release notes' backups make) doesn't expose a usable token without `.env`.
- One-time Google Cloud setup is unavoidable and is documented; the consent screen shows an "unverified app" warning, which is expected for a personal app.
- An old email labelled long after it arrived falls outside the two-day window and is missed; accepted.
- Gmail is polled on the feed interval; no push notifications.

## Alternatives considered
- **Token in the browser** (localStorage, sessionStorage or a cookie): the poller runs with no browser open, so the server would only have the token while a tab is making requests; localStorage is also readable by any page script.
- **Token in SQLite unencrypted:** simplest, but a database backup would carry a live credential.
- **macOS Keychain:** the best store on a Mac, but the app runs in Docker and can't reach it.
- **IMAP with an app password:** fewer setup steps, but a full-mailbox credential, no read-only scope, and labels only as folders.
- **Hand-written `fetch` calls instead of `@googleapis/gmail`:** no dependency, but the app would own token refresh, revocation and error mapping.
- **Gmail History API (`startHistoryId`):** efficient, but it can't filter by query, so every change in the mailbox would be fetched and matched locally.
