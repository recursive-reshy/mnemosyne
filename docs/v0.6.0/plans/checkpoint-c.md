# Checkpoint C plan: Phases 6–7 (sources and sync)

Next: **Checkpoint C, task 6.1** (Plan cell ⬜). On approval: save this to `docs/v0.6.0/plans/checkpoint-c.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint C`, push, then start 6.1.

Read: PRD §6.2–6.4, TRD §1, §3.2, §5, §8 (poller part), §9, §10.1–10.2, ADR 0035, ADR 0007. Order is strict. Every task: red (watch it fail for the right reason) → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: `test`, `lint`, `typecheck` (and `build` for server) for every package touched; web tasks also run `test:browser`. No test touches the network or a real Gmail account; Gmail is faked at the `gmail/auth.ts` boundary (`withGmail` / `getGmailClient`) or at `gmail.client.ts`.

Existing tests pass unchanged except where listed in a log line.

## Decisions taken while planning
- **Sync window (decided with Naresh):** keep ADR 0035's `after = sync_from − 2 days` for checks, and at creation **baseline** the margin: list the ids in `[ sync_from − 2 days, now ]` and store any not going to the inbox as `skipped` (headers via `format: 'metadata'`, no bodies). So the first check never picks up older mail, as PRD 6.3/6.4 require. Newsletter backfill `30d`/`90d`/`all` already covers the margin; `none` baselines everything but the newest; jobs baselines all. Baseline rows don't count toward `last_skipped_count`. This refines TRD §5.4 (which says jobs lists nothing); I'll note it in the log line and the checkpoint report, no ADR needed unless Naresh wants one.
- **Out of reach until later checkpoints:** auto-summarize queueing after a check (`queueNewsletterMessage`, TRD §6.2) is task 8.3, and `extractPending()` in the poller is task 9.3. In 6.4 the rows are stored as `inbox` / `pending` and nothing is queued or extracted; 6.6's poller runs feeds then `checkDueSources()` only. The code leaves a marked seam (a call site returning the added rows) so 8.3 and 9.3 plug in without rewriting. The log lines say so.
- **Labels move into the client (6.1):** 4.4 left `listLabels` in `gmail.service.ts` calling `withGmail` directly. 6.1 adds `gmail.client.ts#listLabels` (raw `GmailLabel`-shaped result, filter and sort stay in the service) and the service calls it. `gmail.routes.test` mocks at the auth boundary; if that mock still serves the call, no test changes, otherwise I'll move the mock and list it.
- **Unknown label ids:** a label-kind check calls `listLabels` once, skips ids no longer present and records `last_error` "Label not found in Gmail: <id>" while the other labels still run. Avoids parsing Gmail 400s.
- **`label_names`:** resolved at read time from one `listLabels` call; on any failure (not connected, API error) fall back to the ids, so the sources list never fails because of labels.
- **Preview count:** list up to 501 ids; `count = min( n, 500 )`, `count_capped = n > 500`.
- **Not connected:** `checkSource` skips quietly when there is no `connected` account (no error recorded). The routes that must answer 409 (preview, create, check, check all) call a small `requireConnectedGmail()` in the service first (409 "Gmail isn't connected" / "Gmail isn't configured"). Edit, delete and list work offline (TRD §5.6 gives 409 only to those four).
- **Message storage:** `parseMessage` output maps to `StoredGmailMessage` with `body_html` / `body_text` kept for both destinations (alert emails need them for re-extract; newsletters until they leave `inbox`). `added_at` for new rows is `now − index` ms so the newest sorts first, as feeds do.
- No new dependency in this checkpoint (web uses MUI components already in use; charset decoding uses Node's `TextDecoder`, which supports the common legacy charsets in full-ICU builds, checked in 6.2).

---

## 6.1 `gmail/gmail.client.ts` (TRD §5.1–5.2)
- Tests first (`gmail.client.test.ts`) with a fake `gmail_v1.Gmail` injected by mocking `withGmail` to call `fn( fakeClient )`:
  - `listLabels`: calls `users.labels.list( { userId: 'me' } )`, returns id/name/type.
  - `listMessageIds`: `labelIds: [ labelId ]` vs `q`; `after:<unix seconds>` appended to `q` (and used alone when `q` is absent); `includeSpamTrash: false`; pages with `pageToken` until `max` ids and stops requesting once `max` is reached; trims to `max`; empty result → `[]`; keeps Gmail's newest-first order.
  - `getMessage( id, format )`: `users.messages.get( { userId: 'me', id, format } )`, default `full`; `metadata` accepted.
  - `countMatches( match )`: labels → merged, de-duplicated ids across labels (any-label), query → one call; up to 500 (501 listed, see decisions); unknown label ids skipped and reported (returns `{ ids, missingLabelIds }` from a shared `listMatchingIds( match, { after, max } )` that 6.3/6.4 reuse).
  - Errors from `withGmail` (`GmailAuthError`) pass through.
- Red: module missing. Green: the four functions plus `listMatchingIds` (matching rules of §5.2; ordering by `internalDate` happens in the service after fetch, since ids carry no dates).
- Also: `gmail.service.ts` uses `listLabels` from the client (see decisions).
- Gate: server.

## 6.2 `gmail/parseMessage.ts` (TRD §5.3), pure
- Tests first on hand-made `gmail_v1.Schema$Message` fixtures saved under `src/test-support/gmail/` (JSON, built by a small helper in the test so base64url encoding stays readable): simple `text/plain`; `multipart/alternative` (html + text); `multipart/mixed` > `multipart/related` > `multipart/alternative` (depth-first order); an attachment with `filename` (skipped) and one with `Content-Disposition: attachment` and no filename (skipped); inline image parts ignored; ISO-8859-1 and Windows-1252 and Shift_JIS bodies decoded by `charset`; invalid or unknown charset falls back to UTF-8; email with no HTML (`html: null`); no text at all (both null); `Subject` missing → "(no subject)"; RFC 2047 encoded words in `Subject` and `From` (B and Q encodings, UTF-8 and ISO-8859-1, adjacent words joined); `From` as `"Name" <a@b.c>`, `Name <a@b.c>`, bare address, quoted comma in name; header names case-insensitive; `List-Unsubscribe` present → true; `receivedAt` from `internalDate` (ms string) as ISO; missing `internalDate` → throws a clear error.
- Red: module missing. Green: header lookup, encoded-word decoder, address splitter, depth-first part walk, base64url decode with `TextDecoder`.
- Gate: server.

## 6.3 `services/gmailSources.service.ts`: preview, create, update, delete (TRD §5.4–5.5)
- Tests first (`gmailSources.service.test.ts`, in-memory DB from `test-support/database.setup.ts`, `gmail.client.js` mocked with canned ids and messages, `settings` real):
  - `toPublicSource`: counts (`inbox_count` from `countInbox`, `postings_count` from `countPostingsForSource`), `label_names` resolution and fallback to ids.
  - `previewSource`: count and `count_capped`; newest from the first id with `format: 'metadata'` (subject, from, received_at); empty match → `count 0`, `newest null`; overlaps (§5.5): same query after trim and collapsing spaces, shared label id, deleted and disabled sources excluded? (TRD says "active sources": not deleted; enabled or not both count, matching the `listActiveSourcesByMatch` choice from 3.2), a label match never overlaps a query match.
  - `createSource`: requires connected; validates `profile_id` with `assertActiveProfile` (reuse); stores `sync_from = now`; newsletter `none` → newest `inbox` (`backfilled 0`), the margin ids `skipped`; `30d` / `90d` / `all` → every id in the window `inbox` with `backfilled = 1`, capped at 200 (response unchanged, the skip of the rest is by the window cap, not stored); jobs → margin ids stored as `skipped`, nothing in `inbox`/`pending`; any one email matched by two labels stored once; `GmailAuthError` mid-way leaves no source row (transaction around source + messages; Gmail fetches happen before the transaction).
  - `updateSource`: name, match, profile, enabled, auto_summarize; newsletter-only fields refused for jobs (400 via the shared refine already, plus a `BadRequestError` for the stored-destination check); unknown id and deleted source → `NotFoundError`; changing `match` leaves `sync_from` alone (documented in the log line).
  - `deleteSource( id, { removeInboxItems } )`: soft delete, `dismissInboxForSource` only when asked, postings untouched; unknown or already deleted → `NotFoundError`.
- Red: module missing. Green: service built like `feeds.service.ts` (`inTransaction`, `toPublic*`, `requireActive*`), `requireConnectedGmail()`, overlap helper.
- Gate: server.

## 6.4 `checkSource`, `checkAllSources`, `checkDueSources` (TRD §5.4)
- Tests first (same file family, `gmailSources.check.test.ts`):
  - Window: lists with `after = sync_from − 2 days`, `max 100`; ids already in `gmail_messages` for this source are not fetched (`findMessagesByIds` / `insertMessageIfNew` guard); the same email under two sources is stored once per source.
  - Newsletter: new rows `inbox` up to 10, the rest `skipped`, `last_skipped_count` = overflow; newest first via `added_at`; `last_checked_at` set, `last_error` null.
  - Jobs: new rows `pending`, no cap; `sync_from` doesn't move.
  - Disabled, deleted or Gmail not connected (no account, `reconnect_needed`) → skipped with no error recorded and no Gmail call; `checkSource` of a disabled source via the route is a 409 like feeds.
  - Errors: a non-auth error for one message fetch records `last_error` and keeps the messages already stored; a `GmailAuthError` propagates out of `checkSource` after recording nothing, ends `checkAllSources` and `checkDueSources` (the account is already `reconnect_needed`), and doesn't touch later sources; a missing label records "Label not found in Gmail: <id>" and still processes the other labels.
  - `checkAllSources`: enabled sources in order, returns the public list; `checkDueSources`: `listDueSources( now, interval )` with `feed_check_interval_minutes`, returns the number checked, logs and continues after a plain error, stops on `GmailAuthError`.
- Red: functions missing. Green: implement over `listMatchingIds`, `getMessage`, `parseMessage`, `insertMessageIfNew`, `recordSourceCheck`. Marked seams for 8.3 (auto-summarize) and 9.3 (extract) return the added rows.
- Gate: server.

## 6.5 Gmail source routes (TRD §5.6)
- Tests first (`gmailSources.routes.test.ts`, Supertest, service mocked at the `gmailSources.service` boundary for status mapping, plus a few cases through the real service with `gmail.client` mocked): all seven endpoints in the TRD table; 400 on bad bodies (`CreateGmailSourceBody` refinements, empty `PATCH`, bad uuid), 404 unknown id, 409 not connected / not configured for preview, create, check one, check all; `remove_inbox_items=true|false` (default false); `POST /sources/check` is registered before `/:id/…`; responses parse with the shared schemas; no token or body content in responses.
- Red: routes 404. Green: `routes/gmailSources.routes.ts`, `controllers/gmailSources.controller.ts` (zod-parse, like `feeds.controller.ts`), mounted in `app.ts` beside `gmailRoutes`.
- Update `apps/server/CLAUDE.md` folder structure (`gmail.client`, `parseMessage`, the new service, routes and controller).
- Gate: server (lint, typecheck, build).

## 6.6 `worker/intakePoller.ts` replaces `feedPoller.ts` (TRD §8)
- Tests first: move `feedPoller.test.ts` to `intakePoller.test.ts` with renames (`startIntakePoller`; the existing cases pass unchanged apart from names, listed in the log). New cases: after `checkDueFeeds`, `checkDueSources` runs when `config.gmail` is set and the account is `connected`; skipped when not configured, not connected or `reconnect_needed`; a feed failure doesn't stop the Gmail part and a Gmail failure doesn't stop the next tick; a `GmailAuthError` is logged once and ends the Gmail part for that pass; the stop function waits for a pass in progress; busy passes don't overlap; the log line counts feeds and sources.
- Red: module missing. Green: rename file and function, add the Gmail part with a `isGmailReady()` helper from `gmail.service.ts` (config + `findAccount()` status).
- `server.ts` and `shutdown.ts` (and `shutdown.test.ts`): `stopFeedPoller` → `stopIntakePoller`; `grep` shows only these files reference the old name. Remove the old file and test.
- Update `apps/server/CLAUDE.md` (worker line).
- Gate: server (test, lint, typecheck, build).

## 7.1 Web: Gmail source hooks (TRD §10.1)
- Tests first (hooks with the existing `renderWithClient` and mocked `api/` modules, like `useFeeds.test.ts`, `useFeedPreview.test.ts`):
  - `api/gmailSources.api.ts` (+ test, `fetch` mocked like `feeds.api.test.ts`): list, preview, create, update, delete (`?remove_inbox_items=`), check one, check all; URLs, methods, bodies, response parsing, error mapping.
  - `queryKeys.ts` gains `gmailKeys.sources`; `queryKeys.test.ts` extended.
  - `useGmailSources` (list + `createSource`, `updateSource`, `deleteSource`, `checkSource`, `checkAllSources`; every mutation invalidates `gmail-sources`, `jobs` and the feed inbox key now, plus `inbox` once 8.5 renames it) and `usePreviewGmailSource` (mutation, resettable, like `useFeedPreview`).
  - Gmail source fixture in `test-support/gmail.fixture.ts`.
- Red: modules missing. Green: mirror `useFeeds` and `useFeedPreview`.
- Gate: web (test, lint, typecheck; `test:browser`).

## 7.2 Web: Sources list (TRD §10.2)
- Tests first (`GmailSourceList.test.tsx`, `GmailSettings.test.tsx` additions): rows show name, match (label-name chips or the query in monospace), destination chip, last checked (reuse `checkedAt`), last error, counts (inbox items or jobs collected), enable switch (calls `updateSource`), **Check now**, edit, delete; **Check all now** disabled while pending and while not connected; empty state; the sources area is hidden for `not_configured` and shows a hint with disabled actions for `not_connected` / `reconnect_needed`; mutation errors shown in an `Alert` like `FeedSettings`.
- Red: component missing. Green: `GmailSourceList` modelled on `FeedList`, wired into `GmailSettings` under the account card; `GmailSettings` tests that mock child components stay valid (mock `GmailSourceList` in them as `SettingsPage.test` did).
- Gate: web (test, test:browser, lint, typecheck); browser check against the real server, light and dark.

## 7.3 Web: `AddGmailSourceDialog`, `EditGmailSourceDialog`, delete dialog (TRD §10.2)
- Tests first (one test file per component, as for the feed dialogs):
  - Add: name; **Labels / Search** toggle (labels via `useGmailLabels( { enabled } )` multi-select `Autocomplete`, max 10; search text field with a link to Gmail's search operators); destination radio; newsletter-only fields (profile select, **Summarize automatically**, backfill select with default 30 days) hidden for jobs; **Preview** runs `usePreviewGmailSource`, shows the count (`500+` when capped), newest subject and sender, an overlap warning listing source names, a "matches nothing" warning that still allows saving, and for backfill "N emails will go to your inbox" plus "only the newest 200" over the cap; **Save** disabled until a preview of the *current* match exists (changing the match or toggling kind clears the preview); create errors shown; dialog closes and resets on success.
  - Edit: destination read-only, jobs sources hide the newsletter fields, only changed fields are sent, match change requires a new preview.
  - Delete: asks whether to also remove inbox items (newsletter sources only; jobs shows a note that collected jobs stay), sends `removeInboxItems`.
  - Wire the three into `GmailSettings` via a `GmailDialogs` file mirroring `FeedDialogs`.
- Red: components missing. Green: build from `FeedFields`/`AddFeedDialog` patterns; shared fields in a `GmailSourceFields` component to keep Add and Edit consistent.
- `apps/web/CLAUDE.md`: components list if it names them.
- Gate: web (test, test:browser, lint, typecheck); browser check of both dialogs, light and dark.

## End of checkpoint
Report per CLAUDE.md "Before you stop": tasks with commit hashes; test, lint, typecheck (and build, `test:browser`) per folder; the browser screenshots/checks for 7.2–7.3 in light and dark; the sync-window refinement of TRD §5.4 and the two seams left for 8.3 / 9.3; no ADR expected. Then stop; checkpoint D needs Naresh's real fixtures from TRD §9.2.

## Verification
- Per task: `pnpm --filter @mnemosyne/server test|lint|typecheck|build`, same for `@mnemosyne/web` plus `test:browser`.
- Server end-to-end by tests only (no real Gmail in this checkpoint); the real connect, backfill and sources run is task 11.3.
- Web: run the app against the real server and check the Gmail section in all four account states plus the new list and dialogs.
