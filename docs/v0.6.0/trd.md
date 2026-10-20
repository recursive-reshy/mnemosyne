# Mnemosyne v0.6.0 — Technical Requirements

Companion to `docs/v0.6.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.5.0 code at commit `c2071cd`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet. In code, freelance job postings are **postings** (ADR 0037); "job" keeps meaning a processing job.

> **Scope change (2026-10-20, ADR 0041):** job-alert extraction and the Freelance jobs page are deferred to a later version. §7, §10.4 (except the drawer warning) and §10.5 are not built in v0.6.0 and are kept as that version's design. What was already built stays: the postings contracts (§2.3), `extraction_model` in settings (§2.4) and the postings tables in migration 6 (§3.1), unused. New in their place: the server refuses `destination: 'jobs'` on create and the web form has no destination choice (§5.7). Phases and checkpoints are in §11.

## 1. Changes at a glance
- **Shared:** Gmail account, source, message and inbox schemas; posting schemas; `ArticleMeta.origin` gains `'email'`; `Job` gains Gmail source fields; `Settings` gains `extraction_model`.
- **Server:**
  - a Gmail intake (ADR 0035): OAuth connect / callback / disconnect, an encrypted refresh token, a Gmail client, sources matched by label IDs or a search, a date-window sync;
  - email to Markdown for newsletters (ADR 0036), reusing the pasted-text path into a normal article job;
  - a unified inbox over feed items and newsletter emails (ADR 0038), replacing `/api/feed-items`;
  - ~~job-alert extraction with Claude into `job_postings` (ADR 0037), with runs, retries and re-extract~~ (deferred, ADR 0041);
  - the feed poller becomes an intake poller (feeds, then Gmail sources);
  - migration 6.
- **Web:** Settings → Gmail (connection and sources); the home-page **Inbox** for both kinds; ~~a **Freelance jobs** page at `/freelance`~~ (deferred, ADR 0041).
- **New dependencies** (and only these):
  - server: `@googleapis/gmail` (dependency; brings `google-auth-library`).
  - Pin it to the version current when the task adds it. Check its actual API against this TRD before using it; if it differs in a way that changes the design, stop and ask. Use `google-auth-library` through the package's re-export (or add it as a direct dependency only if the import requires it, recorded in the log line).
- **Environment:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, all optional (§4.1). No Docker or host changes beyond `.env`.

## 2. Shared contracts (`packages/shared`)

### 2.1 Gmail (`gmail.ts`, new)
```ts
GmailConnectionStatus = 'not_configured' | 'not_connected' | 'connected' | 'reconnect_needed'
GmailAccount = { status: GmailConnectionStatus, email: string | null,
                 connected_at: iso | null, error: string | null }
GetGmailAccountResponse = { account: GmailAccount }

GmailLabel = { id: string, name: string, type: 'system' | 'user' }
ListGmailLabelsResponse = { labels: GmailLabel[] }           // user labels first, then INBOX, by name

GmailDestination = 'newsletter' | 'jobs'
GmailMatch = { kind: 'labels', label_ids: string[].min(1).max(10) }
           | { kind: 'query', query: string.trim().min(1).max(500) }
Backfill = 'none' | '30d' | '90d' | 'all'

GmailSource = { id: uuid, name: string, match: GmailMatch, label_names: string[],   // names resolved at read time
                destination: GmailDestination,
                profile_id: uuid | null, auto_summarize: boolean,                 // newsletter only; null/false for jobs
                enabled: boolean, sync_from: iso,
                last_checked_at: iso | null, last_error: string | null, last_skipped_count: int,
                inbox_count: int, postings_count: int, created_at: iso }
SourceName = z.string().trim().min( 1 ).max( 100 )

PreviewGmailSourceBody     = { match: GmailMatch }
PreviewGmailSourceResponse = { count: int, count_capped: boolean,               // counted up to 500
                               newest: { subject: string, from: string, received_at: iso } | null,
                               overlaps: { id: uuid, name: string }[] }          // §5.5
CreateGmailSourceBody = { name: SourceName, match: GmailMatch, destination: GmailDestination,
                          profile_id?: uuid, auto_summarize?: boolean, backfill?: Backfill }
                          // refine: profile_id, auto_summarize, backfill only with 'newsletter'
UpdateGmailSourceBody = { name?, match?, profile_id?: uuid | null, enabled?, auto_summarize? }
                          // at least one; destination is not updatable; newsletter-only fields refused for jobs
ListGmailSourcesResponse = { sources: GmailSource[] }        // not deleted, by name
GmailSourceResponse = { source: GmailSource }
```

### 2.2 Inbox (`inbox.ts`, new; replaces `FeedItem` in `feeds.ts`)
```ts
InboxItemRef = { kind: 'feed' | 'gmail', id: uuid }
InboxItem = { kind: 'feed', id, feed_id, feed_name, title, link: url, published_at: iso | null,
              source_type: SourceType, added_at: iso }
          | { kind: 'gmail', id, source_id, source_name, title,                   // subject
              sender: string, link: url,                                          // Gmail link, §6.3
              published_at: iso, source_type: 'article', added_at: iso }
ListInboxResponse = { items: InboxItem[] }                   // newest added_at first
SummarizeInboxBody = { items: InboxItemRef[].min(1).max(50), model?: string, profile_id?: uuid }
SummarizeInboxResponse = { jobs: Job[] }
DismissInboxBody   = { items: InboxItemRef[].min(1).max(200) }
```
`FeedItem`, `ListFeedItemsResponse`, `SummarizeFeedItemsBody` and `DismissFeedItemsBody` are removed (the web is their only consumer).

### 2.3 Postings (`postings.ts`, new)
```ts
BudgetType = 'fixed' | 'hourly'
PostingDetails = {
  budget: { type: BudgetType, min: number | null, max: number | null, currency: string | null } | null,
  skills: string[], description: string | null, experience_level: string | null,
  duration: string | null, proposals: string | null,
  client: { country: string | null, rating: number | null, total_spent: string | null,
            payment_verified: boolean | null, hires: string | null } | null,
  extra: { key: string, value: string }[],
}
Posting = { id: uuid, platform: string, platform_job_id: string | null, title: string, url: url,
            posted_at: iso | null, first_seen_at: iso, last_seen_at: iso, sightings: int,
            details: PostingDetails }
ListPostingsQuery = { q?: string.max(200), platform?: string, limit: int 1–100 = 50, offset: int ≥ 0 = 0 }
ListPostingsResponse = { postings: Posting[], total: int, filtered: int, platforms: string[] }

AlertEmailStatus = 'pending' | 'extracted' | 'no_jobs' | 'failed'
AlertEmail = { id: uuid, source_id, source_name, subject, sender, received_at: iso, link: url,
               status: AlertEmailStatus, postings_count: int, attempts: int, error: string | null }
ListAlertEmailsQuery = { status?: AlertEmailStatus, limit, offset }
ListAlertEmailsResponse = { emails: AlertEmail[], total: int }
PostingSightingsResponse = { emails: AlertEmail[] }          // the emails a posting appeared in
```

### 2.4 Changes to existing contracts
- `ArticleMeta.origin` gains `'email'`.
- `Job` gains `gmail_source_id: uuid | null` and `gmail_source_name: string | null` (beside `feed_id` / `feed_name`).
- `Settings` gains `extraction_model: string` (fallback: the newest model whose id contains `haiku` from `listModels()`, else the default model; not seeded). `UpdateSettingsBody` accepts it, validated with `assertKnownModel`. The `.refine` message lists the new key.
Schema tests for each, as in 0.5.0.

## 3. Data (SQLite)

### 3.1 Migration 6 (a function migration, `addGmailAndPostings`)
```sql
CREATE TABLE gmail_account (
  id INTEGER PRIMARY KEY CHECK ( id = 1 ),
  email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,   -- §4.2, never the plain token
  scope TEXT NOT NULL,
  status TEXT NOT NULL,              -- 'connected' | 'reconnect_needed'
  error TEXT,
  connected_at TEXT NOT NULL
);

CREATE TABLE gmail_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_kind TEXT NOT NULL,          -- 'labels' | 'query'
  label_ids TEXT,                    -- JSON array when match_kind = 'labels'
  query TEXT,                        -- when match_kind = 'query'
  destination TEXT NOT NULL,         -- 'newsletter' | 'jobs'
  profile_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_summarize INTEGER NOT NULL DEFAULT 0,
  sync_from TEXT NOT NULL,
  last_checked_at TEXT,
  last_error TEXT,
  last_skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE gmail_messages (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES gmail_sources ( id ),
  message_id TEXT NOT NULL,          -- Gmail's id
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,              -- display name, else address
  sender_address TEXT NOT NULL,
  received_at TEXT NOT NULL,         -- internalDate
  body_html TEXT,                    -- the chosen part, §5.3
  body_text TEXT,
  status TEXT NOT NULL,              -- newsletter: 'inbox' | 'dismissed' | 'queued' | 'skipped'
                                     -- jobs: 'pending' | 'extracted' | 'no_jobs' | 'failed' | 'skipped'
  backfilled INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  job_id TEXT,
  added_at TEXT NOT NULL,
  UNIQUE ( source_id, message_id )
);
CREATE INDEX gmail_messages_status ON gmail_messages ( status, added_at );

CREATE TABLE job_postings (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,            -- lower-case, e.g. 'upwork'
  platform_job_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,   -- §7.3
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  posted_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  details TEXT NOT NULL              -- PostingDetails JSON
);
CREATE INDEX job_postings_seen ON job_postings ( first_seen_at );

CREATE TABLE posting_sightings (
  posting_id TEXT NOT NULL REFERENCES job_postings ( id ),
  gmail_message_row TEXT NOT NULL REFERENCES gmail_messages ( id ),
  seen_at TEXT NOT NULL,
  PRIMARY KEY ( posting_id, gmail_message_row )
);

CREATE TABLE extraction_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_row TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  outcome TEXT NOT NULL,             -- 'extracted' | 'no_jobs' | 'failed'
  postings_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE jobs ADD COLUMN gmail_source_id TEXT;   -- no foreign key, like feed_id
```
Tested from `user_version = 5` with a feed, an inbox item and a job in review (all untouched), and from an empty database.

Body columns: for newsletters, `body_html` / `body_text` are cleared when the row leaves `inbox` (as `feed_items.content_markdown`). For jobs, they are **kept** for re-extraction.

### 3.2 Repositories (new, synchronous free functions on `getDatabase()`, as before)
- `gmailAccount.repository.ts`: `findAccount()`, `saveAccount( row )` (upsert id 1), `setAccountStatus( status, error )`, `deleteAccount()`.
- `gmailSources.repository.ts`: `listSources()`, `findSourceById( id )` (deleted too), `insertSource`, `updateSource`, `markSourceDeleted`, `listDueSources( now, intervalMinutes )`, `recordSourceCheck( id, { last_checked_at, last_error, last_skipped_count } )`, `listActiveSourcesByMatch()` (for the overlap check).
- `gmailMessages.repository.ts`: `insertMessageIfNew( row ): boolean`, `findMessagesByIds( ids )`, `listNewsletterInbox()`, `setMessageStatus( ids, status, jobId? )` (clears bodies for newsletter rows leaving `inbox`), `listPendingAlerts( sourceId, limit )` (`pending`, or `failed` with `attempts < 3`, oldest first), `recordAttempt( id, { status, error } )` (increments `attempts`), `listAlertEmails( query )`, `countInbox( sourceId )`, `dismissInboxForSource( sourceId )`.
- `postings.repository.ts`: `upsertPosting( row, messageRowId, seenAt )` (insert, or on `dedupe_key` conflict update `title`, `url`, `posted_at`, `details` and `last_seen_at`; insert the sighting `ON CONFLICT DO NOTHING`), `listPostings( query )` (§7.5), `listPlatforms()`, `listSightings( postingId )`, `countPostingsForSource( sourceId )`.
- `extractionRuns.repository.ts`: `insertExtractionRun( row )`.
- `jobStore.repository.ts`: `gmail_source_id` column; `listActiveJobs` / `findJob` join `gmail_sources` for `gmail_source_name`.
- Update `apps/server/CLAUDE.md` repositories line.

## 4. Server: Gmail connection (ADR 0035)

### 4.1 Config (`config.ts`)
New optional variables, with `emptyAsUnset`:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: strings.
- `GOOGLE_REDIRECT_URI`: URL, default `http://localhost:${ PORT }/api/gmail/oauth/callback`.
- `TOKEN_ENCRYPTION_KEY`: base64 that decodes to exactly 32 bytes; anything else fails startup with "TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)".
- `config.gmail = { clientId, clientSecret, redirectUri, encryptionKey: Buffer } | null`: `null` unless all of client ID, secret and key are set. `null` → account status `not_configured`, Gmail endpoints other than `GET /api/gmail/account` answer 409 "Gmail isn't configured", and the poller skips Gmail.
- `.env.example` lists the four names with one-line comments (and the `openssl` command). `docker-compose.yml` unchanged (it already uses `env_file`).

### 4.2 Token encryption (`gmail/tokenCipher.ts`, new)
- `encryptToken( plain, key ): string` → `v1:<iv b64>:<tag b64>:<ciphertext b64>`, AES-256-GCM, 12-byte random IV, Node `crypto` only.
- `decryptToken( stored, key ): string`; a wrong key, tampered value or unknown version throws `TokenDecryptError`.
- Pure, unit-tested: round trip, different IV per call, wrong key, tampered tag, bad format.
- The plain refresh token exists only inside the auth module (§4.3). The access token is never stored.

### 4.3 OAuth (`gmail/auth.ts`, new)
- `SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'`.
- `createConsentUrl(): string`: an `OAuth2Client` from `google-auth-library` with the config; `generateAuthUrl( { access_type: 'offline', prompt: 'consent', scope: [ SCOPE ], state, include_granted_scopes: false } )`. `state` is 32 random bytes (hex), kept in an in-memory `Map< state, expiresAt >` for 10 minutes; at most 20 outstanding (oldest dropped).
- `completeConsent( { code, state } )`: refuse an unknown or expired `state` (`OAuthStateError`, consumed on first use either way); `getToken( code )`; refuse if `refresh_token` is missing or the granted scope lacks `SCOPE`; read the address with `users.getProfile( { userId: 'me' } )`; `saveAccount` with the encrypted token, status `connected`.
- `getGmailClient()`: returns a `gmail_v1.Gmail` on an `OAuth2Client` with the decrypted refresh token set; cached per process and rebuilt when the account row changes. No account → `GmailNotConnectedError`; decrypt failure → status `reconnect_needed` ("The stored Gmail access can't be read; reconnect") and `GmailNotConnectedError`.
- `withGmail( fn )`: runs `fn( client )`; an `invalid_grant` error (or 401 after refresh) sets `reconnect_needed` with "Google no longer accepts Mnemosyne's access (revoked, expired, or the app is in Testing)" and throws `GmailAuthError`. All Gmail calls go through it.
- `disconnect()`: `revokeToken( refreshToken )` (errors ignored, logged without the token), `deleteAccount()`, clear the client cache. Sources and data stay.
- Logging: never log tokens, codes or `Authorization` headers; a test asserts the logger never receives them on the error paths.

### 4.4 Routes (`routes/gmail.routes.ts`, new; `controllers/gmail.controller.ts`)
- `GET /api/gmail/account` → `GetGmailAccountResponse`.
- `GET /api/gmail/connect` → 302 to the consent URL (409 when not configured). The web links to it as a full-page navigation.
- `GET /api/gmail/oauth/callback?code&state&error` → always a 302 to `/settings?gmail=connected`, or `/settings?gmail=error&reason=<code>` with `reason` one of `denied`, `state`, `no_refresh_token`, `scope`, `failed`. Never renders a token.
- `POST /api/gmail/disconnect` → 204.
- `GET /api/gmail/labels` → `ListGmailLabelsResponse` (409 not connected).
- Tests: Supertest with the Google client mocked at the `gmail/auth.ts` boundary (`vi.mock`), no network.

## 5. Server: Gmail sources and sync (ADR 0035)

### 5.1 Gmail client wrapper (`gmail/gmail.client.ts`, new)
Thin functions over `gmail_v1.Gmail`, each through `withGmail`, each unit-tested with a fake client:
- `listLabels()`.
- `listMessageIds( { labelId?, q?, after?: Date, max } ): Promise< string[] >`: `users.messages.list` with `labelIds: [ labelId ]` or `q`, `after:<unix seconds>` appended to `q` when given, `includeSpamTrash: false`, paging with `pageToken` until `max` ids. Newest first, as Gmail returns them.
- `getMessage( id )`: `users.messages.get( { id, format: 'full' } )`.
- `countMatches( match )`: list up to 500 ids (§2.1 `count_capped`).

### 5.2 Matching
- `labels`: one `listMessageIds` per label ID, ids merged (any label matches) and de-duplicated; order by `internalDate` after fetch.
- `query`: one call with the query as written.
- Unknown label IDs (deleted in Gmail) → the source's `last_error` "Label not found in Gmail: <id>" and that label is skipped; the source keeps working with the rest.

### 5.3 Reading a message (`gmail/parseMessage.ts`, new, pure)
`parseMessage( message: gmail_v1.Schema$Message )` → `{ messageId, subject, sender, senderAddress, receivedAt, html: string | null, text: string | null, listUnsubscribe: boolean }`:
- Headers `Subject` (default "(no subject)"), `From` (display name and address split; RFC 2047 encoded words decoded), `List-Unsubscribe`.
- `receivedAt` from `internalDate`.
- Walk `payload.parts` depth-first; first `text/html` and first `text/plain` not inside an attachment (`filename` empty, no `Content-Disposition: attachment`). Body `data` is base64url; decode with the part's `charset` (default UTF-8). `multipart/alternative`, `multipart/related` and `multipart/mixed` nest.
- Fixture-tested (§9.2).

### 5.4 Sync (`services/gmailSources.service.ts`, new)
- `previewSource( match )`: `countMatches` and the newest message's headers (`format: 'metadata'`), plus overlaps (§5.5).
- `createSource( body )`: validate the profile, store with `sync_from = now`; then:
  - newsletter, `backfill` `none`: list with no `after`, `max: 1`; the newest goes to `inbox`.
  - newsletter, `30d` / `90d` / `all`: list with `after = now − window` (no `after` for `all`), `max: 200`; each becomes `inbox` with `backfilled = 1`. The response is returned once all are stored.
  - jobs: nothing is listed; collection starts at `sync_from`.
- `checkSource( id )`: skipped if disabled, deleted, or Gmail not connected (no error recorded for the last). Lists with `after = sync_from − 2 days`, `max: 100`, fetches each id not already in `gmail_messages` for this source (`format: 'full'`), parses and stores:
  - newsletter: status `inbox` up to the per-check cap of **10**, the rest `skipped` (counted in `last_skipped_count`). Auto-summarize sources queue non-backfilled rows at once (§6.2).
  - jobs: status `pending` (no cap at intake; extraction is capped, §7.4).
  - Then `recordSourceCheck` with `last_checked_at = now`, `last_error` null or the message. `sync_from` doesn't move; the `UNIQUE` row is what prevents re-processing.
- `checkAllSources()`, `checkDueSources()` (interval from `feed_check_interval_minutes`).
- `updateSource`, `deleteSource( id, { removeInboxItems } )` as feeds (soft delete; jobs and postings stay).
- A `GmailAuthError` during a check stops the whole Gmail pass (the account is now `reconnect_needed`).

### 5.5 Overlap check
`overlaps` lists active sources whose match is exactly the same: the same `query` string after trimming and collapsing spaces, or a shared label ID. Shown as a warning; never blocks.

### 5.6 Routes (`routes/gmailSources.routes.ts`, new)
| Method | Path | Body | Response | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/gmail/sources` | | `ListGmailSourcesResponse` | |
| POST | `/api/gmail/sources/preview` | `PreviewGmailSourceBody` | `PreviewGmailSourceResponse` | 400, 409 not connected |
| POST | `/api/gmail/sources` | `CreateGmailSourceBody` | `GmailSourceResponse` (201) | 400, 409 not connected |
| PATCH | `/api/gmail/sources/:id` | `UpdateGmailSourceBody` | `GmailSourceResponse` | 400, 404 |
| DELETE | `/api/gmail/sources/:id?remove_inbox_items=` | | 204 | 404 |
| POST | `/api/gmail/sources/:id/check` | | `GmailSourceResponse` | 404, 409 not connected |
| POST | `/api/gmail/sources/check` | | `ListGmailSourcesResponse` | 409 not connected |

### 5.7 Jobs destination refused (ADR 0041)
- `createSource` refuses `destination: 'jobs'` with `ValidationError( "Freelance jobs sources aren't available yet" )` (400). `GmailDestination` keeps both values in `packages/shared`, so stored data and the later version need no contract change.
- The check path for jobs sources (6.4) stays as built; with no way to create one, it is unreachable. No migration.
- Web: `AddGmailSourceDialog` drops `GmailDestinationField` and always sends `destination: 'newsletter'`; the newsletter options always show. `GmailSourceList` keeps its destination chip (it reads stored data).

## 6. Server: newsletters (ADR 0036, ADR 0038)

### 6.1 Email to Markdown (`sources/emailToMarkdown.ts`, new, pure)
`emailToMarkdown( { html, text } ): string`:
1. No HTML → `text` with lines trimmed, then step 5.
2. Parse with linkedom. Remove `img`, `picture`, `style`, `script`, `head`, elements styled `display:none`, `max-height:0` or `mso-hide:all`, and the preheader (a first element with `display:none` or `opacity:0`).
3. Try Readability on a clone. If its `htmlToMarkdown` output is ≥ `ARTICLE_LIMITS.minExtractedChars`, use it.
4. Otherwise convert the whole cleaned body with `htmlToMarkdown( html, { layoutTables: 'unwrap' } )`: a new option on the existing function that replaces each `table`, `tbody`, `tr` and `td` with its content (each `td` becomes a block), instead of removing tables (a second turndown instance, built once). The default (articles) is unchanged.
5. Trim: drop a leading line that is a "view in browser / view online / read online" link; find the last block containing a link whose text or URL matches `unsubscribe|manage (your )?(preferences|subscription)|email preferences` and, if it starts in the final third of the text, cut from that block to the end.
6. Collapse blank lines as `htmlToMarkdown` does; trim.
Fixture-tested on the saved newsletters (§9.2): output contains the body text, contains no unsubscribe footer, no tracking URLs as images, and no table syntax.

### 6.2 Newsletter jobs
`queueNewsletterMessage( source, row, choices )` (in `services/inbox.service.ts`, §6.4):
- `markdown = emailToMarkdown( row )`; shorter than `minPastedChars` → the inbox action fails for that item with "This email has too little text to summarize" (the item stays in the inbox).
- `articleFromText( { url: gmailLink( row ), text: markdown, title: row.subject, origin: 'email', author: row.sender, site: source.name, published: row.received_at.slice( 0, 10 ) } )` → `queueJob` with the source's (or chosen) profile and model, `gmail_source_id` set, status `summarizing`.
- `setMessageStatus( [ row.id ], 'queued', job.id )`.
- `articleFromText` already takes `author`, `site` and `published` (0.5.0 `TextInput`); no change beyond the new `'email'` origin.
- `site` is the **source's name**, so "Lenny's Newsletter" can be set by naming the source; `author` is the sender's display name.

### 6.3 Gmail links (`gmail/links.ts`, new)
`gmailLink( { email, messageId } )` = `https://mail.google.com/mail/u/${ encodeURIComponent( email ) }/#all/${ messageId }`. Used for notes' `source`, inbox items and alert emails. Confirmed by hand on a real message in the final checks (task 10.3); if it doesn't open the message, stop and ask.

### 6.4 Unified inbox (`services/inbox.service.ts`, replaces `feedInbox.service.ts`)
- `listInbox()`: feed rows (`feed_items` status `inbox`) and newsletter rows (`gmail_messages` status `inbox` of newsletter sources) mapped to `InboxItem`, newest `added_at` first.
- `summarizeItems( { items, model, profile_id } )`: per ref, `queueFeedItem` (unchanged) or `queueNewsletterMessage`; refs not in the inbox are ignored, as today. Per-item failures are collected and returned as a 422 with the failed titles only if **every** item failed; otherwise the jobs that succeeded are returned.
- `dismissItems( { items } )`: per kind.
- The feeds service imports `queueFeedItem` from here; `feedInbox.service.ts` and its tests move here with the same behaviour.

### 6.5 Routes (`routes/inbox.routes.ts`, new; the feed-item routes are removed from `feeds.routes.ts`)
| Method | Path | Body | Response | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/inbox` | | `ListInboxResponse` | |
| POST | `/api/inbox/summarize` | `SummarizeInboxBody` | `SummarizeInboxResponse` | 400, 422 |
| POST | `/api/inbox/dismiss` | `DismissInboxBody` | 204 | 400 |

## 7. Server: job postings (ADR 0037) — DEFERRED (ADR 0041)
Not built in v0.6.0; kept as the design for the version that adds job-alert intake.

### 7.1 Extraction prompt (`postings/prompt.ts`, new)
`EXTRACTION_INSTRUCTIONS`, fixed in code:
```
You extract freelance job postings from a job-alert email.

The email is given as Markdown, with its subject and sender.

Return every job posting in the email, in order. For each one:
- platform: the marketplace, in lower case (for example upwork, freelancer, fiverr, peopleperhour).
- platform_job_id: the platform's own id for the job if it appears in a link or the text (on Upwork, the part starting with ~01), else null.
- title, url: the posting's title and its link, exactly as in the email.
- posted_at: when the job was posted, as an ISO 8601 date-time, only if the email states it; else null.
- budget, skills, description, experience_level, duration, proposals and client: only what the email states. Do not guess. Use null or an empty list when absent.
- extra: any other fact the email gives about the posting, as key and value pairs.

If the email contains no job postings (a newsletter, an announcement, a digest with no results), return an empty list.
```
Output schema `ExtractionResult = { postings: ExtractedPosting[] }` with `zodOutputFormat`, as the summarizer does; `ExtractedPosting` = `{ platform, platform_job_id, title, url, posted_at }` plus `PostingDetails` (§2.3).

### 7.2 Client (`clients/claude.client.ts`)
`extractPostings( { subject, sender, markdown, model } ): Promise< { result: ExtractionResult, usage } >`. User message: `Subject: …\nFrom: …\n\n<markdown>`, markdown cut to 100,000 characters. `max_tokens` 8,000. Errors → `ExtractionError` with usage when known, like `SummaryError`. Integration test file mirrors `claude.integration.test.ts` (skipped without a key).

### 7.3 Dedupe key (`postings/dedupe.ts`, new, pure)
- With `platform_job_id`: `${ platform }:${ platform_job_id }`.
- Else: `${ platform }:${ normalizeUrl( url ) }`, where `normalizeUrl` lower-cases the host, drops `www.`, the query string, the fragment and a trailing slash.
- Postings with no `url` or `title` are dropped and counted in the run's error text ("2 postings without a link were skipped").
- Table-driven tests, including Upwork links with tracking parameters.

### 7.4 Extraction service (`services/postings.service.ts`, new)
- `extractAlertEmail( row )`: `emailToMarkdown( row )` → `extractPostings` with `extraction_model` → for each posting `upsertPosting` (sighting at `row.received_at`) → `recordAttempt` `extracted` (with count) or `no_jobs` → `insertExtractionRun` with tokens and `estimateCostUsd`. On error: `recordAttempt` `failed` with the message; run recorded with outcome `failed`.
- `extractPending( sourceId )`: `listPendingAlerts( sourceId, 20 )`, one at a time. Called by the intake poller after each jobs source's check, and by **Check now**.
- `reextract( messageRowId )`: allowed for `extracted`, `no_jobs` and `failed`; resets `attempts` to 0 and runs `extractAlertEmail` now. Postings upsert by key, so re-extraction updates rather than duplicates; postings that the new run no longer finds are left in place.
- `retry( messageRowId )`: only `failed`; same as re-extract.
- An `ExtractionError` from a missing API key or a 401 stops the pass for all sources (recorded on each email as usual).

### 7.5 Listing
`listPostings( { q, platform, limit, offset } )`: newest `first_seen_at` first. `q` matches, case-insensitively, `title LIKE`, `json_extract( details, '$.description' ) LIKE`, or `EXISTS ( SELECT 1 FROM json_each( details, '$.skills' ) WHERE value LIKE … )`. `%` and `_` in `q` are escaped. `total` is all postings, `filtered` the count with the filters.

### 7.6 Routes (`routes/postings.routes.ts`, new)
| Method | Path | Query / body | Response | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/postings` | `ListPostingsQuery` | `ListPostingsResponse` | 400 |
| GET | `/api/postings/:id/sightings` | | `PostingSightingsResponse` | 404 |
| GET | `/api/postings/emails` | `ListAlertEmailsQuery` | `ListAlertEmailsResponse` | 400 |
| POST | `/api/postings/emails/:id/reextract` | | `{ email: AlertEmail }` | 404, 409 |
| POST | `/api/postings/emails/:id/retry` | | `{ email: AlertEmail }` | 404, 409 not failed |

## 8. Server: intake poller and settings
- (Built in 6.6; the extraction step below is deferred with §7.) `worker/feedPoller.ts` → `worker/intakePoller.ts`, `startIntakePoller()`: every 60 seconds, if no pass is running: `checkDueFeeds()`, then, when Gmail is configured and connected, `checkDueSources()` and `extractPending()` for each jobs source checked. A failure in one part is logged and doesn't stop the others (except `GmailAuthError`, which ends the Gmail part). Same stop semantics as today; `server.ts` and `shutdown.ts` updated. Existing poller tests move with it.
- Settings: `extraction_model` read with its fallback (§2.4); `GET /api/settings` includes it. `PATCH` validates it.

## 9. Tests

### 9.1 Rules
- No test touches the network or a real Gmail account. The Google client is replaced at the `gmail/auth.ts` boundary; `@googleapis/gmail` is never called in unit tests.
- Existing tests pass unchanged, except: the feed-item route and service tests move to the inbox (§6.4–6.5), the poller tests move to `intakePoller` (§8), and the `htmlToMarkdown` tests gain the `layoutTables` cases. List each in the log line.
- Repositories, services, routes, parsers and pure functions are all test-first, as in 0.5.0. Web: React Testing Library unit tests; browser tests only where real DOM behaviour matters (none expected).

### 9.2 Fixtures (`apps/server/src/test-support/gmail/`)
- `scripts/save-gmail-fixture.ts` (new, server `devDependencies` unchanged; run with `pnpm --filter mnemosyne-server fixture:gmail <messageId> <name>`): uses the stored connection, fetches the message with `format: 'full'`, replaces Naresh's address and name everywhere (headers and bodies) with `naresh@example.com` / `Naresh`, and writes `<name>.json`. Added in checkpoint B.
- Naresh saves about five real messages before checkpoint D: at least two newsletters (one Substack or similar, one table-heavy) and alerts from Upwork and Freelancer.com (one with several postings). Plus hand-made fixtures: multipart nesting, an attachment, a non-UTF-8 charset, an email with no HTML.
- Extraction tests use a recorded `ExtractionResult` per alert fixture (written by hand from the email), not live Claude output.

## 10. Web

### 10.1 Data layer (`api/`)
New query and mutation hooks on TanStack Query, as 0.5.0's: `useGmailAccount`, `useGmailLabels`, `useGmailSources`, `usePreviewGmailSource`, `useCreate/Update/Delete/CheckGmailSource`, `useInbox` (replaces `useFeedItems`), `useSummarizeInbox`, `useDismissInbox`, `usePostings( query )` (`keepPreviousData` while paging), `usePostingSightings`, `useAlertEmails`, `useReextract`, `useRetry`. Inbox and source mutations invalidate `inbox`, `gmail-sources` and `jobs`.

### 10.2 Settings → Gmail (`components/GmailSettings`, new, beside `FeedSettings`)
- Account card by status: `not_configured` (setup steps, a link to the README section), `not_connected` (**Connect Gmail**, a plain `<a href="/api/gmail/connect">`), `connected` (address, **Disconnect** with a confirm dialog), `reconnect_needed` (reason, **Reconnect**).
- On load, `?gmail=connected` or `?gmail=error&reason=` shows a snackbar ("Gmail connected" / a message per reason) and the query is removed with `replace`.
- Sources list like `FeedList`: name, match (label chips or the query in monospace), destination chip, last checked, last error, counts, on/off switch, **Check now**, edit, delete. **Check all now**.
- `AddGmailSourceDialog`: name; match as a toggle **Labels / Search** (labels: a multi-select `Autocomplete` from `useGmailLabels`; search: a text field with a link to Gmail's search operators); destination radio (**Newsletter** / **Freelance jobs**); for newsletters, profile select, **Summarize automatically**, backfill select (None / Last 30 days / Last 90 days / All, default 30 days). **Preview** shows count (with "500+"), newest subject and sender, any overlap warning, and for a backfill "N emails will go to your inbox" (and "only the newest 200" when over the cap). Save is enabled after a preview of the current match.
- `EditGmailSourceDialog`: name, match, profile, auto-summarize (destination shown read-only).
- Disabled with a hint when not connected.

### 10.3 Home page inbox
`FeedInbox` becomes `Inbox` (title **Inbox**): rows from `useInbox`, a chip with the feed or source name, a mail icon for Gmail items, the sender under the title for Gmail items, the link opening the original (feed link or Gmail). Selection, Summarize (with `SummarizeItemsDialog`) and Dismiss work over `InboxItemRef`s. A partial failure shows a snackbar listing the items that failed.

### 10.4 Freelance jobs page (`/freelance`, `components/FreelancePage`, new) — DEFERRED (ADR 0041), except the drawer warning in its last bullet, which ships in v0.6.0
- Drawer item **Freelance jobs** (icon `WorkOutline`) between Home and Settings.
- Two tabs: **Postings** and **Alert emails**.
- Postings: search field (debounced 300 ms) and platform select (from `platforms`); "N of M postings"; an MUI `Table` with expandable rows: posted date (else first seen), title as an external link, platform, budget (`$30–50/hr`, `$500 fixed`, or blank), skills as chips (first five, then "+n"). The expanded row shows every non-empty field of `details` (client, experience, duration, proposals, description, extra) and the sightings (`usePostingSightings`) with links to the emails. `TablePagination` at 50 per page.
- Alert emails: table of received date, source, subject (Gmail link), status chip with count or error, attempts, and **Re-extract** or **Retry**.
- Empty states: not connected or no jobs source → a message and a link to Settings; a source but nothing yet → "No postings yet. New job alerts are read every <interval>."
- The drawer shows a warning dot on **Settings** when the account is `reconnect_needed` (from `useGmailAccount`, polled every 5 minutes).

### 10.5 Settings → Summaries — DEFERRED (ADR 0041)
An **Extraction model** select beside the default model, from `useModels`, with "Used to read job-alert emails".

## 11. Phases (detail in `tasks.md`)
Phases 1–8 (checkpoints A–D) are done. After the scope change (ADR 0041):
9. **Defer job alerts:** accept ADR 0041, refuse the jobs destination (server) and remove the destination choice (web), drawer warning on reconnect needed.
10. **Clean-up and verification:** docs (`CLAUDE.md` files, README setup section including the dev redirect URI), versions 0.6.0, final checks with a real account, release notes.

Checkpoints: **A**–**D** as before (done), **E** = phase 9, **F** = phase 10. The former postings checkpoints (old phases 9–10) move to the later version.

## 12. ADRs (new, drafted with this TRD)
- 0035 Gmail intake: `@googleapis/gmail`, server-side OAuth, an encrypted refresh token, label-ID and query sources with a date-window sync
- 0036 Newsletters: email to Markdown with Readability first and unwrapped layout tables as fallback
- 0037 Job postings: Claude extraction into fixed columns plus JSON, deduplicated by platform job ID
- 0038 One inbox for feed items and newsletter emails
- 0041 Defer job-alert intake and the Freelance jobs page to a later version (added 2026-10-20)

## 13. Open questions
None. Decided with Naresh before drafting: all of the above, with the refresh token encrypted at rest (key in `.env`) rather than kept in the browser, because the poller reads Gmail with no browser open.
