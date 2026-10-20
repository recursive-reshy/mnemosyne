# Checkpoint F plan: Phase 10 (clean-up and verification)

Next: **Checkpoint F, task 10.1** (Plan cell ⬜). On approval: save this to `docs/v0.6.0/plans/checkpoint-f.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint F`, push, then start 10.1.

Read: PRD §5, §6.1–6.3, §7; TRD §4.1, §6.3, §9, §11; ADR 0035, 0040, 0041. Order is strict. This checkpoint has no new behaviour, so there are no failing tests to write first: 10.1, 10.2 and 10.4 are docs and version strings, and 10.3 is verification. Each task still ends with Status tick + log line, commit, push. Gate after 10.2: `pnpm test`, `lint`, `typecheck`, `build` across all packages.

## Decisions taken while planning
- **README heading is exactly `## Google Cloud setup for Gmail`.** The not-configured card in Settings links to `#google-cloud-setup-for-gmail` (log line 5.2, which called it task 11.1).
- **Docs describe what shipped, not the deferred half.** Job alerts appear only as "deferred" (README roadmap, release notes). No Freelance jobs page, no `/api/postings`, no `extraction_model` in user docs. The unused postings tables and the `extraction_model` setting are named in the release notes' "Under the hood" as kept for the later version (ADR 0041).
- **Release notes live at `docs/v0.6.0/release-notes.md`**, modelled on 0.5.0's: not-yet-released line, New, Changes, Upgrading (database backup first, then Google setup), Known issues, Under the hood, Decisions (ADRs 0035, 0036, 0038, 0040 new and 0039 superseded; 0037 deferred and 0041 accepted). Test counts are filled in from 10.3's real run, so 10.4 comes after 10.3, as ordered.
- **Version bump is the four `package.json` files** (root, `apps/server`, `apps/web`, `packages/shared`), 0.5.0 → 0.6.0. I'll grep for any other `0.5.0` (Dockerfile, health route, web footer, CLAUDE.md files) and change only version strings, not history ("Version 0.5.0 adds…").
- **10.3 needs Naresh.** I run everything that doesn't need a Google account; the real-account steps are a checklist I hand him, and I stop there. I won't tick 10.3 until he confirms each step, and I won't tag or date the release.

## 10.1 README and root CLAUDE.md
- No test (docs). Edit [README.md](README.md):
  - Intro and "How it works": add Gmail newsletters (read-only, polled, land in the Inbox beside feed items; summarized like articles; note `source` links to the email). Rename "From feeds" to **Inbox**. Diagram gains a `Gmail API` line.
  - Requirements: a Google account and a one-time Google Cloud setup (Gmail is optional; the app works without it).
  - **`## Google Cloud setup for Gmail`** (new, after Setup): create a project; enable the Gmail API; Google Auth Platform → Branding (app name, support email, homepage and privacy policy links; any URL of Naresh's will do); Audience: External, add himself as test user, then **Publish app → In production** (in Testing, refresh tokens expire after 7 days; ADR 0035); Data Access scope `gmail.readonly`; Clients → Web application with redirect URIs `http://localhost:3100/api/gmail/oauth/callback` (Docker) and, for dev, `http://localhost:5173/api/gmail/oauth/callback` with `GOOGLE_REDIRECT_URI` set to match; copy ID and secret into `.env`; `openssl rand -base64 32` for `TOKEN_ENCRYPTION_KEY`; restart; **Connect Gmail** in Settings; the "unverified app" warning is expected. I'll check the current console menu names against Google's docs (context7 or web) before writing, since these screens change.
  - Using it: **Gmail sources** (labels or a search, preview with overlaps, backfill none/30/90/all with the 200 cap, Summarize automatically, 10 new emails per check cap, Check now / Check all now, delete with the "remove inbox items" choice); **Inbox** (replaces From feeds; Gmail rows with sender, source chip and a Gmail link); Disconnect and Reconnect; the drawer warning dot.
  - Configuration table: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (default `http://localhost:<PORT>/api/gmail/oauth/callback`), `TOKEN_ENCRYPTION_KEY`, all optional; Gmail is off unless ID, secret and key are all set; a malformed key stops startup.
  - API paragraph: add the Gmail endpoints from TRD §4.4 and §5.6 (account, connect, OAuth callback, disconnect, labels, sources list/preview/create/update/delete/check/check-all). The inbox endpoints are already there.
  - Development: the `fixture:gmail` script (`pnpm --filter @mnemosyne/server fixture:gmail <messageId> <name> [display name]`, strips mailbox fields and links, output in `apps/server/src/test-support/gmail/`); note that no test touches Gmail.
  - Troubleshooting: Reconnect needed after 7 days (app still in Testing); reconnect after revoking access; the dev callback landing on `:3100` (Google redirected to the Docker port: use the `:5173` redirect URI and `GOOGLE_REDIRECT_URI`, or stop Docker); "Gmail isn't configured" (missing ID, secret or key); a changed `TOKEN_ENCRYPTION_KEY` means Reconnect needed; an email with too little text can't be summarized and stays in the inbox; a source whose label was deleted in Gmail shows "Label not found".
  - Status and roadmap: replace the "Gmail adapter" bullet with "Freelance job alerts from Gmail (Upwork, Freelancer.com): extraction into a postings dataset and a Freelance jobs page, deferred from 0.6.0 (ADR 0041)".
- Edit root [CLAUDE.md](CLAUDE.md): the Architecture paragraph gains Gmail intake (OAuth in the server, encrypted refresh token, sources by label or search, newsletters into the unified inbox, ADRs 0035, 0036, 0038, 0040). The Workflow line "current version is 0.6.0" is already correct. Also scan `apps/server/CLAUDE.md` and `apps/web/CLAUDE.md` for statements that no longer match (e.g. "FeedInbox", "feed poller", `/api/feed-items`) and fix them in the same commit.
- Gate: none beyond a diff read. Commit `docs(10.1): README Gmail setup and the architecture paragraph`.

## 10.2 Version 0.6.0
- Edit `version` in `package.json` (root), `apps/server/package.json`, `apps/web/package.json`, `packages/shared/package.json`. README status line → "Version 0.6.0". Update any other literal version string the grep finds (not history text).
- Test: if a test asserts the version (grep first), it moves with the change; otherwise none.
- Gate: all packages `test`, `lint`, `typecheck`, `build`. Commit `chore(10.2): version 0.6.0`.

## 10.3 Final checks
Automated, run by me, results recorded in the log line:
- `pnpm test` (shared, server, web), `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm --filter web test:browser` (Chromium and WebKit). `pnpm --filter @mnemosyne/server test:integration` too if whisper-server is running (otherwise say it was skipped).
- Docker: `docker compose build` succeeds. I do not start it over Naresh's running container or data volume without asking.
- Migration on a copy of the real 0.5.0 database: ask Naresh where the 0.5.0 database is (the `mnemosyne_mnemosyne-data` volume; copy `mnemosyne.db*` out as in the 0.5.0 backup command into the scratchpad, never touching the original). Run the server's migrations against the copy with a small script or a scratch server on another port with `DATA_DIR` pointed at the copy; check `user_version` is 6, existing jobs, feeds, profiles and settings are unchanged, and the six new tables are empty. Record the result for the release notes.

With Naresh (checklist given to him; I tick each only on his word):
1. Google Cloud setup done per the new README; Docker started with the four variables; **Connect Gmail** from Settings reaches "Connected as …".
2. A newsletter source with a 30-day backfill: preview count and overlap warning look right; items appear in the Inbox, none summarized.
3. Summarize one email: the note reviews and saves; `author`, `site`, `published` are right.
4. The Gmail link on the inbox row and in the note's `source` opens the email (TRD §6.3). If it doesn't, stop and ask.
5. Revoke access in the Google account page; wait for a check (or Check now): Settings shows Reconnect needed, the drawer dot appears, sources are paused; Reconnect restores it.
6. Disconnect, then connect again.
- If any step fails, I stop and report instead of working around it. Commit only the `tasks.md` tick and log line: `docs(10.3): final checks`.

## 10.4 Release notes
- Write `docs/v0.6.0/release-notes.md` as described above; link it from the v0.6.0 line in `docs/README.md` (and change "(planning)" to "(done)" only if Naresh has confirmed 10.3; otherwise leave it for him). Real test counts from 10.3. Known issues come from the log: 100-email check window, backfill cap keeps the first 200 merged ids with several labels, labelling an old email falls outside the two-day window (ADR 0035), the TRD §6.4 line about unknown refs is out of date for Naresh to fix, job alerts deferred.
- Commit `docs(10.4): v0.6.0 release notes`.

## End of checkpoint
Stop and report: tasks with commit hashes; test, lint, typecheck, build and test:browser results per package; the migration result on the 0.5.0 copy; which real-account steps Naresh confirmed and which are still open; ADRs written (none expected; none change the TRD beyond those already noted: 0040 changes TRD §6.1, 0039 superseded, 0041 scope); anything deferred. Do not tag or date the release.
