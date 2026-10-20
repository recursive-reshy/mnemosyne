# Tasks — Mnemosyne v0.6.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package (and `test:browser` for web), browser screenshots (light and dark) of any screens touched, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR and add its number to the task's ADR column.
- **Dependencies:** only the ones in TRD §1, each added by the task that first uses it. Check its real API against the TRD first; if it differs in a way that changes the design, stop and ask.
- **No test touches the network or a real Gmail account.** Use fixtures, fakes at the `gmail/auth.ts` boundary, and local servers on port 0.
- Existing tests pass unchanged, except the changes TRD §9.1 allows; list each one in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–3 (kick-off, contracts, data)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Set ADRs 0035–0038 to Accepted (Status lines and the `docs/README.md` index, listed as Proposed); mark 0032 as amended by 0038 in the index and its file | 0035–0038 | ✅ |
| **Phase 2** | **Shared contracts** | | |
| 2.1 | `gmail.ts` (account, labels, match, sources, preview, create/update bodies with their refinements), with tests (TRD §2.1) | 0035 | ✅ |
| 2.2 | `inbox.ts` (`InboxItemRef`, `InboxItem`, list/summarize/dismiss); remove the `FeedItem` contracts from `feeds.ts` and repoint their web imports to compile against the new types (behaviour unchanged until 8.5) (TRD §2.2) | 0038, 0039 | ✅ |
| 2.3 | `postings.ts` (`PostingDetails`, `Posting`, list query/response, `AlertEmail`, sightings), with tests (TRD §2.3) | 0037 | ✅ |
| 2.4 | `ArticleMeta.origin` gains `email`; `Job` gains `gmail_source_id` / `gmail_source_name` (server returns null until 3.2); `Settings` gains `extraction_model` (TRD §2.4) | 0035, 0037 | ✅ |
| **Phase 3** | **Server data** | | |
| 3.1 | Migration 6 `addGmailAndPostings` (TRD §3.1), tested from version 5 with a feed, an inbox item and a review job, and from empty | 0035, 0037 | ✅ |
| 3.2 | Repositories: `gmailAccount`, `gmailSources`, `gmailMessages`, `postings`, `extractionRuns`; `jobStore` Gmail source column and name join; `apps/server/CLAUDE.md` repositories line (TRD §3.2) | 0035, 0037, 0038 | ✅ |

## Checkpoint B: Phases 4–5 (Gmail connection, server and web)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Gmail connection** | | |
| 4.1 | Config: the four optional variables, the key check, `config.gmail`; `.env.example` (TRD §4.1) | 0035 | ✅ |
| 4.2 | `gmail/tokenCipher.ts` (AES-256-GCM, `v1:` format, `TokenDecryptError`) (TRD §4.2) | 0035 | ✅ |
| 4.3 | Add `@googleapis/gmail`; `gmail/auth.ts`: consent URL and state store, `completeConsent`, `getGmailClient`, `withGmail` and the reconnect rule, `disconnect`, no secrets in logs (TRD §4.3) | 0035 | ✅ |
| 4.4 | Gmail account routes: account, connect, callback redirects, disconnect, labels (TRD §4.4) | 0035 | ✅ |
| 4.5 | `scripts/save-gmail-fixture.ts` and the `fixture:gmail` script, with the scrubbing tested on a hand-made message (TRD §9.2) | 0035 | ✅ |
| **Phase 5** | **Web connection** | | |
| 5.1 | `api/gmail.api.ts`, `gmailKeys`, `useGmailAccount`, `useGmailLabels` (TRD §10.1) | 0035 | ✅ |
| 5.2 | `GmailSettings` account card for all four states, the `?gmail=` snackbar, Disconnect confirm; placed in `SettingsPage` (TRD §10.2) | 0035 | ✅ |

## Checkpoint C: Phases 6–7 (sources and sync)
**Plan:** ✅ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Sources and sync** | | |
| 6.1 | `gmail/gmail.client.ts`: labels, message ids with label / query / `after`, message, count (TRD §5.1–5.2) | 0035 | ✅ |
| 6.2 | `gmail/parseMessage.ts` on hand-made fixtures: headers, encoded words, nested parts, attachments skipped, charsets (TRD §5.3) | 0035 | ✅ |
| 6.3 | `services/gmailSources.service.ts`: preview with overlaps, create (newsletter backfill and newest, jobs from now), update, delete (TRD §5.4–5.5) | 0035 | ✅ |
| 6.4 | `checkSource`, `checkAllSources`, `checkDueSources`: window, de-duplication, newsletter cap, jobs `pending`, auth failure ends the pass (TRD §5.4) | 0035 | ✅ |
| 6.5 | Gmail source routes (TRD §5.6) | 0035 | ✅ |
| 6.6 | `worker/intakePoller.ts` replaces `feedPoller.ts` (feeds, then Gmail sources), `server.ts` and `shutdown.ts` (TRD §8) | 0035 | ✅ |
| **Phase 7** | **Web sources** | | |
| 7.1 | Gmail source hooks (TRD §10.1) | 0035 | ✅ |
| 7.2 | Sources list with switches, Check now and Check all (TRD §10.2) | 0035 | ✅ |
| 7.3 | `AddGmailSourceDialog` (labels or search, destination, newsletter options and backfill, preview and overlap warning) and `EditGmailSourceDialog`, delete dialog (TRD §10.2) | 0035 | ⬜ |

## Checkpoint D: Phase 8 (newsletters and the inbox)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

Needs the real fixtures from TRD §9.2, saved by Naresh with `fixture:gmail`. Check they exist before planning; if not, stop and ask.

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **Newsletters and inbox** | | |
| 8.1 | `htmlToMarkdown` `layoutTables: 'unwrap'` option (articles unchanged) (TRD §6.1 step 4) | 0036 | ⬜ |
| 8.2 | `sources/emailToMarkdown.ts` on the newsletter fixtures (TRD §6.1) | 0036 | ⬜ |
| 8.3 | `gmail/links.ts`; `services/inbox.service.ts` replacing `feedInbox.service.ts` (tests move), `listInbox` over both kinds, `queueNewsletterMessage`, summarize with partial failure, dismiss; auto-summarize newsletter sources (TRD §6.2–6.4) | 0036, 0038 | ⬜ |
| 8.4 | Inbox routes; feed-item routes removed (route tests move) (TRD §6.5) | 0038 | ⬜ |
| 8.5 | Web: `useInbox`, `useSummarizeInbox`, `useDismissInbox`; `FeedInbox` → `Inbox` with Gmail rows and partial-failure snackbar; Gmail source chip in `JobList` and `JobHeading` (TRD §10.3) | 0038 | ⬜ |

## Checkpoint E: Phase 9 (postings, server)
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 9** | **Postings server** | | |
| 9.1 | `postings/prompt.ts` and `ExtractionResult`; `extractPostings` in the Claude client, plus its integration test file (TRD §7.1–7.2) | 0037 | ⬜ |
| 9.2 | `postings/dedupe.ts` (TRD §7.3) | 0037 | ⬜ |
| 9.3 | `services/postings.service.ts`: `extractAlertEmail`, `extractPending`, `reextract`, `retry`, runs and cost; wired into the intake poller and Check now (TRD §7.4, §8) | 0037 | ⬜ |
| 9.4 | Listing with search and platform filter, sightings, alert emails (TRD §7.5) | 0037 | ⬜ |
| 9.5 | Postings routes; `extraction_model` in settings with its fallback; `apps/server/CLAUDE.md` and root `CLAUDE.md` architecture paragraph (TRD §7.6, §8) | 0037 | ⬜ |

## Checkpoint F: Phase 10 (postings, web)
**Plan:** ⬜ [`plans/checkpoint-f.md`](plans/checkpoint-f.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 10** | **Postings web** | | |
| 10.1 | Postings hooks (TRD §10.1) | 0037 | ⬜ |
| 10.2 | `/freelance` route, drawer item, `FreelancePage` Postings tab with search, filter, expandable rows and pagination, empty states (TRD §10.4) | 0037 | ⬜ |
| 10.3 | Alert emails tab with Re-extract and Retry; drawer warning dot on reconnect needed (TRD §10.4) | 0035, 0037 | ⬜ |
| 10.4 | Extraction model select in Settings; `apps/web/CLAUDE.md` (TRD §10.5) | 0037 | ⬜ |

## Checkpoint G: Phase 11 (clean-up and verification)
**Plan:** ⬜ [`plans/checkpoint-g.md`](plans/checkpoint-g.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 11** | **Clean-up and verification** | | |
| 11.1 | README: Google Cloud setup (project, Gmail API, consent screen, Web client and redirect URI, **In production**), the new variables and `openssl` key, Gmail sources, the Inbox, Freelance jobs, endpoints, troubleshooting (7-day expiry in Testing, reconnect) | | ⬜ |
| 11.2 | Version 0.6.0 in every `package.json` and the README status line | | ⬜ |
| 11.3 | Final checks: all tests, lint, typecheck, build, browser tests, Docker build; migration on a copy of the real 0.5.0 database; with Naresh, a real connect, a newsletter source with backfill, a jobs source, a summarized newsletter note, the Gmail link opening the email (TRD §6.3), a reconnect after revoking access | 0035 | ⬜ |
| 11.4 | `release-notes.md` (upgrade steps with a database backup and the Google setup), linked from `docs/README.md` | | ⬜ |

---

## Log

- 1.1: ADRs 0035–0038 set to Accepted in their files and the index; 0032 marked amended by 0038 in its file and the index. Docs only.
- 2.1: `gmail.ts` added to shared with 26 tests; no existing tests changed. Shared test, lint and typecheck pass.
- 2.2: `inbox.ts` added to shared (32 tests); the `FeedItem` contracts moved to `apps/server/src/services/feedItems.schemas.ts` (ADR 0039, which corrects TRD §2.2: the server also used them). Tests moved: the four `FeedItem*` describe blocks from shared `feeds.test.ts` to `feedItems.schemas.test.ts`. Changed: `feeds.routes.test.ts` imports, and the web `feedItems.api`, `useSummarizeFeedItems`, `useDismissFeedItems` and `FeedInbox` tests for the ref shape (`kind: 'feed'`), `feed.fixture.ts` adds `kind`. Shared, server and web test, lint and typecheck pass.
- 2.3: `postings.ts` added to shared with 40 tests; no existing tests changed. `limit` and `offset` coerce from query strings. Shared test, lint and typecheck pass.
- 2.4: `ArticleMeta.origin` gains `email`, `Job` gains `gmail_source_id` / `gmail_source_name` (read as null until 3.2), `Settings` / `UpdateSettingsBody` gain `extraction_model` (stored value, else `SHIPPED_DEFAULT_MODEL` until 9.5; the PATCH validates it with `assertKnownModel`). Existing tests changed: shared `source.test` (the unknown-origin case now uses `rss`); job fixtures gain the two Gmail fields in shared `job`, `api` and `inbox` tests, server `jobStore`, `summaryRuns`, `jobs.service`, `summarizeJob`, `article.adapter`, `video.adapter` and `feedItems.schemas` tests, and web `job.fixture`; settings expectations gain `extraction_model` in server `settings.service` and `settings.routes` tests and web `summarizer.fixture`. Shared, server and web test, lint and typecheck pass.
- 3.1: Migration 6 `addGmailAndPostings` (six tables, two indexes, `jobs.gmail_source_id`), 12 tests in `database.test.ts` covering an empty database, version 5 with a feed, an inbox item and a review job, constraints and rollback. Existing tests changed: the migration 5 block now runs against `migrations.slice( 0, 5 )` (it used the full list) and drops its `toHaveLength( 5 )`, which moved to the migration 6 block; the `jobs` column list test gains `gmail_source_id`. Server test, lint and typecheck pass.
- 3.2: Repositories `gmailAccount`, `gmailSources`, `gmailMessages`, `postings` and `extractionRuns` with 66 new tests, and `jobStore` now stores `gmail_source_id` and joins `gmail_sources` for `gmail_source_name` (the 2.4 null stubs are gone; 6 new jobStore tests). Choices the TRD left open: `listActiveSourcesByMatch` returns every source that is not deleted, enabled or not; `upsertPosting` keeps `last_seen_at` at the later of the old and new value so an older email processed late can't move it back, and returns the posting's id; `insertExtractionRun` returns the stored row; alert emails leave out rows with status `skipped`. `apps/server/CLAUDE.md` repositories line updated. No existing tests changed. Server test, lint and typecheck pass.
- 4.1: `config.gmail` (`clientId`, `clientSecret`, `redirectUri`, 32-byte `encryptionKey`, else `null`) with 14 new tests; `.env.example` and `apps/server/CLAUDE.md` updated. Existing tests changed: the two full-config `toEqual` expectations in `config.test.ts` gain `gmail: null`. Server test, lint and typecheck pass.
- 4.2: `gmail/tokenCipher.ts` (`encryptToken`, `decryptToken`, `TokenDecryptError`) with 12 tests; no existing tests changed. Server test, lint and typecheck pass.
- 4.3: `@googleapis/gmail` 22.0.2 added; `gmail/auth.ts` with 30 tests. `google-auth-library` is not a direct dependency: `OAuth2` comes from the package's `auth` export. Beyond the TRD: `getGmailClient` throws `GmailAuthError` while the account is `reconnect_needed`, so calls fail fast until a reconnect. No existing tests changed. Server test, lint, typecheck and build pass.
- 4.4: Gmail account routes (`gmail.routes`, `gmail.controller`, `gmail.service`) with 24 tests at the `gmail/auth.ts` boundary; labels are listed through `withGmail` in the service until 6.1 moves them into `gmail.client.ts`. A missing `state` redirects with `reason=state`, a missing `code` with `failed`. `apps/server/CLAUDE.md` folder structure updated. No existing tests changed. Server test, lint, typecheck and build pass.
- 4.5: `gmail/scrubMessage.ts` (`scrubMessage`, `findOwnerName`) with 13 tests, `scripts/save-gmail-fixture.ts` and the `fixture:gmail` script (`pnpm --filter @mnemosyne/server fixture:gmail <messageId> <name> [display name]`). Gmail has no display-name API, so the name comes from the owner's address in the To/Cc headers unless given as a third argument. `scripts` added to the server `tsconfig.json` include (not the build one). The script itself is untested (needs a real account); I only ran it with bad arguments. No existing tests changed. Server test, lint, typecheck and build pass.
- 5.1: `api/gmail.api.ts` (with `GMAIL_CONNECT_URL`), `gmailKeys`, `useGmailAccount` (with a `disconnect` mutation) and `useGmailLabels({ enabled })` with 19 tests, plus `test-support/gmail.fixture.ts`. No existing tests changed. Web test, test:browser, lint and typecheck pass.
- 5.2: `GmailSettings` (four account states, Disconnect confirm, `?gmail=` snackbar) and `useGmailRedirectNotice` (reads the callback query once, removes it with `replace`) with 25 tests; placed after `FeedSettings`. The not-configured card links to `#google-cloud-setup-for-gmail` in the README, so task 11.1 must use that heading. The snackbar is anchored bottom-centre so it doesn't cover the drawer. `apps/web/CLAUDE.md` names `useGmailRedirectNotice` as the one hook that reads the router. Existing tests changed: `SettingsPage.test` mocks `GmailSettings` and checks it renders (and is held back while loading). Checked in a browser against the real server (light and dark, all four states and the snackbar). Web test, test:browser, lint and typecheck pass.
- 6.1: `gmail/gmail.client.ts` (`listLabels`, `listMessageIds`, `getMessage`, `listMatchingIds`, `countMatches`) with 23 tests; `listMatchingIds` merges per-label listings (any label matches) and reports label ids Gmail no longer has, for 6.3/6.4. `countMatches` lists 501 ids to tell exactly 500 from more. `gmail.service.ts#listLabels` now calls the client; the filter and sort stay in the service. No existing tests changed (`gmail.routes.test` still serves it through its `withGmail` mock). Server test, lint, typecheck and build pass.
- 6.2: `gmail/parseMessage.ts` with 31 tests. The hand-made messages are built in the test file (a small helper that base64url-encodes the bodies) instead of JSON files in `test-support/gmail/`, so the nesting and charsets are readable where they're asserted; the real fixtures from 4.5 will go in that folder. Charsets are decoded with Node's `TextDecoder` (ISO-8859-1, Windows-1252 and Shift_JIS tested); an unknown charset falls back to UTF-8. A message with no `id` or no `internalDate` throws. No existing tests changed. Server test, lint, typecheck and build pass.
- 6.3: `services/gmailSources.service.ts` (`requireConnectedGmail`, `listGmailSources`, `previewSource`, `createSource`, `updateSource`, `deleteSource`, plus helpers 6.4 reuses) with 46 tests and a `test-support/gmailMessage.fixture.ts` message builder. Refines TRD §5.4 as agreed in the checkpoint plan: at creation the emails of the last 2 days that don't go to the inbox are stored as `skipped` (headers only), so the first check can't collect them; jobs sources do this too. Server default for `backfill` when omitted is `none`. `listMatchingIds` and `countMatches` gained `heads` (first id of each label's listing) so the newest email across several labels can be found; 6.1's tests updated for it (same task family, no other test touched). With several labels, the 200-email backfill cap keeps the first 200 merged ids rather than the newest 200 overall. Server test, lint, typecheck and build pass.
- 6.4: `checkSource`, `checkAllSources`, `checkDueSources` in `gmailSources.service.ts` with 33 tests (`gmailSources.check.test.ts`), plus `findStoredMessageIds` in the `gmailMessages` repository (3 tests; one `json_each` query, not in the TRD, so already-stored emails aren't fetched again). Choices the TRD left open: `checkSource` and `checkAllSources` are strict (409 for a turned-off source, Gmail not connected, or an auth failure, which they turn into a conflict), while `checkDueSources` quietly returns 0 when Gmail isn't configured or connected and ends its pass at an auth failure; a plain error is recorded in `last_error` and what was read before it is kept; skipped newsletter rows keep no body; `last_skipped_count` is reset by a check that found new mail and kept by one that didn't, as for feeds. A check looks at the newest 100 emails in its window, so a burst of more than 100 unseen emails is not read past the first 100. Auto-summarize (8.3) and extraction (9.3) are not wired yet: `runCheck` returns the rows it added for them. Server test, lint, typecheck and build pass.
- 6.5: `routes/gmailSources.routes.ts` and `controllers/gmailSources.controller.ts` with 42 tests through `app.ts` (Gmail faked at `gmail.client.js`); the seven endpoints of TRD §5.6, `:id` validated as a uuid (400). `previewSource` and `createSource` now turn a `GmailAuthError` into a 409 like the check functions do; the one 6.3 test that expected the raw `GmailAuthError` now expects `ConflictError`. `apps/server/CLAUDE.md` folder structure updated (`gmail.client`, `parseMessage`, `gmailSources`). Server test, lint, typecheck and build pass.
- 6.6: `worker/intakePoller.ts` replaces `feedPoller.ts`: each pass checks due feeds, then due Gmail sources, each in its own try/catch. The poller doesn't test whether Gmail is connected itself: `checkDueSources` returns 0 when it isn't configured or connected and ends its pass at an auth failure (both tested in 6.4). Extraction (`extractPending`) joins it in 9.3. Existing tests changed: `feedPoller.test.ts` moved to `intakePoller.test.ts` with `startFeedPoller` renamed (its eight cases are otherwise unchanged; six new ones cover the sources part), and `shutdown.test.ts` renames `stopFeedPoller` to `stopIntakePoller`. `server.ts`, `shutdown.ts` and `apps/server/CLAUDE.md` updated. Server test, lint, typecheck and build pass. This ends the server half of checkpoint C.
- 7.1: `api/gmailSources.api.ts` (9 tests), `gmailKeys.sources`, `useGmailSources` (list and the five mutations; each refreshes the sources, the feed inbox and the jobs) and `usePreviewGmailSource`, with 18 tests, plus `gmailSourceFixture` and `gmailPreviewFixture` in `test-support/gmail.fixture.ts`. The refresh uses `feedKeys.inbox` until 8.5 renames the inbox. No existing tests changed except `queryKeys.test` gaining the sources key. Web test, test:browser, lint and typecheck pass.
- 7.2: `GmailSourceList` (15 tests: name, destination chip, label chips or the query in monospace, last check, inbox or postings count, skipped count, error alert, On switch, Check now) and `GmailSources` (14 tests: heading, Check all now, hint and disabled actions while not connected, errors), placed in `GmailSettings` under the account card for every status except not configured. Edit and Delete menu items come with the dialogs in 7.3, and the per-source Summarize automatically switch is in the edit dialog (the list only says when it is on). Existing tests changed: `GmailSettings.test` mocks `../GmailSources` and gains four cases. Checked in a browser (light and dark) against a scratch server with a seeded connected account and three search sources; `packages/shared/dist` had to be rebuilt first (it predated `gmail.ts`). Web test, test:browser, lint and typecheck pass.
