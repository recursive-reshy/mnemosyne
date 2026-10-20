# Mnemosyne v0.6.0 — Product Requirements

## 1. Summary
> **Scope change (2026-10-20):** freelance job-alert intake (§6.4) and the Freelance jobs page (§6.5) are deferred to a later version (ADR 0041). v0.6.0 ships the Gmail connection, Gmail sources and newsletters only. The deferred sections are kept below, marked, as the starting point for that version.

v0.6.0 connects Mnemosyne to Naresh's Gmail. He connects his account once from Settings (read-only), then defines **Gmail sources**: one or more labels or a Gmail search. Each new matching email goes into the inbox on the home page, next to feed items, and from there it is summarized into a note like any article. Sources keep a destination field so a later version can add **Freelance jobs** sources (job-alert emails split into postings for the freelance-jobs module) without reworking them.

## 2. Background
0.5.0 added articles, pasted text and RSS feeds behind one source-adapter contract (ADR 0030), and named Gmail as the next intake. Two things only arrive by email: newsletters that publish no RSS feed, and freelance job alerts (saved-search emails from Upwork, Freelancer.com and similar). The freelance-jobs module (brainstormed in October 2026) needs a history of postings in Naresh's niche to learn what clients ask for, at what budget, and to tailor his profile before he starts bidding. That history only builds up from the day collection starts, so intake comes first and the module comes later.

## 3. Goals
- Connect a Gmail account once, read-only, and have Mnemosyne keep reading it in the background without further action.
- Turn email-only newsletters into summary notes through the existing inbox, review and save flow.
- Leave room for job-alert intake later: sources carry a destination, and the postings schema from checkpoint A stays in place, unused.
- Add Gmail as an intake beside RSS, with no change to the job, summary or review code (ADR 0030).

## 4. Non-goals
- **No job-alert intake** in this version: no Freelance jobs sources, no extraction, no Freelance jobs page (deferred, ADR 0041).
- **No CRM.** No job statuses, pipeline, notes, proposals, bidding or Claude-drafted applications. These belong to the freelance-jobs module.
- **No analytics** on the jobs dataset (trends, budget charts, skill counts) and no export. Both come with the module (§8).
- Mnemosyne never changes Gmail. It doesn't mark emails read, archive, label, delete, reply or send. It asks for read-only access only.
- One Gmail account. No other mail providers, no IMAP.
- No attachments. Only the email body is read.
- No push notifications from Gmail (Pub/Sub watch). Sources are polled, like feeds.
- No logging in to Mnemosyne itself. It stays a single-user local app; connecting Gmail is an authorization, not a login.
- No change to the note's sections, the review screen or the save flow.

## 5. User flow
1. **One-time Google setup** (outside the app, documented in the README and release notes). Naresh creates a Google Cloud project, enables the Gmail API, configures the OAuth consent screen with himself as the user, creates a "Web application" OAuth client with Mnemosyne's callback URL as its redirect URI, and sets the app's publishing status to **In production**. He puts the client ID and secret in `.env`.
2. **Connect Gmail.** Settings gets a **Gmail** section with **Connect Gmail**. It opens Google's consent screen, which warns that the app is unverified, as expected for a personal app. Naresh continues and approves read-only access, then lands back in Settings, which shows **Connected as naresh@…** and a **Disconnect** button.
3. **Add a source.** In the same section, **Add source** takes a name, one or more labels (picked from his Gmail labels) or a Gmail search (for example `from:donotreply@upwork.com`), and its newsletter options. Before saving, the app shows how many emails match and the subject of the newest. A newsletter source can also bring past emails into the inbox (backfill).
4. **Newsletters.** New matching emails appear in the home-page inbox (renamed from "From feeds" to **Inbox**) with the source's name, the subject, the sender and the date. **Summarize** and **Dismiss** work as for feed items, and the note goes through review and into the vault.
5. **Something goes wrong.** If Google stops accepting the connection (access revoked, or the app returned to Testing), the Gmail section shows **Reconnect needed** and polling pauses until Naresh reconnects. Sources and collected data are kept.

## 6. Features

### 6.1 Gmail connection
As Naresh, I want to give Mnemosyne read-only access to my Gmail once and not think about it again.
- [ ] Settings → Gmail shows one of three states: **Not connected** (with **Connect Gmail**), **Connected as \<address\>** (with **Disconnect**), or **Reconnect needed** (with **Reconnect** and the reason).
- [ ] If the client ID or secret is missing from the environment, the section says so and links to the setup steps instead of offering Connect.
- [ ] Connecting asks Google for read-only Gmail access only. The callback is protected against forged requests. A refused or failed consent returns to Settings with a plain message.
- [ ] Once connected, the app keeps working across container restarts and rebuilds without asking again. The stored credentials live in the data volume, never in the repo, and are never sent to the web app.
- [ ] **Disconnect** revokes the access at Google, deletes the stored credentials and stops polling. Sources, inbox items and collected jobs are kept.
- [ ] When Google rejects the stored credentials, the app switches to **Reconnect needed**, pauses all Gmail sources, and shows a small warning in the navigation drawer so the problem isn't only visible in Settings. Reconnecting resumes polling where it stopped.
- [ ] Gmail sources can't be added or edited while not connected.

### 6.2 Gmail sources
As Naresh, I want to decide which emails Mnemosyne reads and what it does with them.
- [ ] Settings → Gmail lists each source with its name, match rule, destination, last checked time, last error if any, counts (inbox items or jobs collected), and an on/off switch.
- [ ] A source matches by one or more **labels** (chosen from his Gmail labels; an email with any of them matches) or by **Gmail search** (any query Gmail's search box accepts). Labels are created and applied in Gmail itself, typically by Gmail filters; Mnemosyne only reads them. Before saving, the app runs the match and shows the number of matching emails and the newest subject. A rule that matches nothing can still be saved, with a warning.
- [ ] Every source in this version is a **Newsletter** source. The Add source form has no destination choice, and the server refuses a Freelance jobs source (deferred, ADR 0041). The stored destination stays, so job-alert sources can be added later.
- [ ] Newsletter sources have a prompt profile (default: the default profile) and a **Summarize automatically** switch (off by default), as feeds do.
- [ ] Adding a source doesn't import past emails, except as §6.3 and §6.4 describe for each destination.
- [ ] All enabled sources are checked on the same schedule as feeds (the interval in Settings) and on **Check now**, for one source or all.
- [ ] An email is never processed twice by the same source, even if it is relabelled or matched again later.
- [ ] An email matched by two sources is processed by each. Naresh avoids overlapping rules; the source form warns if a rule overlaps another source's.
- [ ] A failing source shows its error and keeps being retried at the normal interval. Turning a source off stops checks; deleting it stops checks and leaves its jobs, inbox items and notes alone (deleting asks whether to remove its inbox items, as feeds do).

### 6.3 Newsletters
As Naresh, I want email-only newsletters summarized like any article.
- [ ] A new email from a newsletter source becomes an inbox item with the source's name, the subject as its title, the sender, and the date received.
- [ ] Adding a newsletter source offers a **backfill**: bring matching emails from the last N days into the inbox (choices: none, 30 days, 90 days, all; default 30 days), with the number of emails shown before confirming. Older matches are marked seen. With no backfill, only the newest matching email goes to the inbox, so the source visibly works (as feeds do in 0.5.0).
- [ ] Backfilled items only land in the inbox. They are never summarized automatically, even when the source has **Summarize automatically** on, so a backfill costs nothing until Naresh picks items. A backfill is capped at a set number of emails (the TRD sets it), and the confirmation says so when the match is larger.
- [ ] A check adds at most a set number of new emails per source (the same cap as feeds); the rest are marked seen and skipped, and the source shows how many.
- [ ] **Summarize** turns the item into an article job using the email's body, with no page fetch. The body is cleaned before summarizing: tracking pixels, unsubscribe and preference footers, and email layout clutter are dropped. An email with too little text fails with a plain reason, as an article does.
- [ ] The note's `source` is a link that opens the email in Gmail. Its `author` is the sender's name and `site` the newsletter's name (the sender's display name unless the source says otherwise), and `published` is the date received.
- [ ] Nothing is fetched or summarized while an item waits. Inbox items don't expire; a job made from one has the normal 24-hour review expiry.
- [ ] The home-page inbox is renamed **Inbox** and shows feed items and newsletter items together, newest first, each labelled with its feed or source name. Multi-select Summarize and Dismiss work across both.

### 6.4 Job alerts — DEFERRED to a later version (ADR 0041)
Not built in v0.6.0. Kept as the requirements for the version that adds job-alert intake; the decisions in ADR 0037 still stand for it.

As Naresh, I want every posting from my job-alert emails collected so I can later learn what clients in my niche ask for.
- [ ] A new email from a jobs source is read in the background. Claude extracts each posting in it: platform, title, link, posted date, and whatever the email shows of budget (fixed or hourly, amount or range, currency), skills, description, experience level, duration, and client details (country, rating, spend, payment verified).
- [ ] Each posting is stored as one job row. A few fixed fields are always present (source, platform, title, link, posted date, received date, the email it came from); everything else Claude extracted is kept as a flexible record, so a new platform or field needs no schema change.
- [ ] The same posting arriving in two alerts is stored once, matched by its link. The second sighting is recorded against it, not dropped silently.
- [ ] The email's raw content is kept with the postings it produced, so extraction can be re-run later over the whole history (**Re-extract**, per email from the Jobs page, is in scope; re-extracting everything at once is KIV).
- [ ] An email with no postings in it (a digest with zero results, a platform announcement) is recorded as **No jobs found**, not an error.
- [ ] If extraction fails (Claude error, malformed output), the email is marked **Failed** with the reason and retried on the next check, up to a limit. A **Retry** action is available from the Jobs page.
- [ ] Extraction uses Haiku by default (the extraction model is a setting, chosen from the same model list as summaries). Each extraction's tokens and estimated cost are recorded, as summary runs are.
- [ ] Adding a jobs source doesn't process past emails. Matching emails that exist when the source is added are marked seen, and collection starts from the next new email.
- [ ] A check processes at most a set number of emails per jobs source (the TRD sets the cap), so a flood of alerts is spread over several checks rather than spending in one go.
- [ ] Job rows never expire and never go to the vault.

### 6.5 Jobs page — DEFERRED to a later version (ADR 0041)
Not built in v0.6.0; kept for the same version as §6.4.

As Naresh, I want a simple list to see that jobs are being collected and skim what comes in.
- [ ] A **Jobs** item in the navigation drawer opens a list of collected postings, newest first: posted date, title (opening the original posting in a new tab), platform, budget, and skills.
- [ ] A search box filters by title, description and skills; a platform filter narrows to one platform. The list shows the total and the filtered count.
- [ ] Expanding a row shows everything extracted for that posting, the alert email it came from (with a link to open the email in Gmail), and when it was first and last seen.
- [ ] A small panel or tab lists the processed alert emails with their status (**Extracted** with a posting count, **No jobs found**, **Failed**) and the **Re-extract** and **Retry** actions.
- [ ] The page shows clearly when nothing has been collected yet, and when Gmail isn't connected or no jobs source exists, with a link to Settings.
- [ ] No editing, statuses, notes or deleting of individual postings.

### 6.6 Source adapters and intakes
- [ ] Gmail is a new **intake** in the sense of ADR 0030, beside RSS. Newsletter items enter the existing pipeline through the pasted-text path; nothing downstream (summaries, review, save, expiry) knows a job came from Gmail beyond the source name shown in the UI.
- [ ] (Deferred with §6.4.) Job-alert processing is a separate path that ends in the jobs dataset, not in a summary job. It does not use the job worker, so a long transcription never delays extraction.
- [ ] Gmail polling sits with the existing feed poller (one schedule, one place that checks intakes).

## 7. Constraints
- Single user, local, as before. Sources, the jobs dataset, processed-email records and the Gmail credentials live in the existing SQLite database and data volume; existing jobs, feeds and notes carry over unchanged.
- Read-only Gmail access only. Gmail data is fetched over the official Gmail API, never by scraping.
- The OAuth client ID and secret come from `.env` (new variables listed in `.env.example`, names only). The refresh token is stored in the data volume and never logged or returned by the API.
- The OAuth callback runs on the app's existing localhost port; no other port or host service is added.
- New dependencies only as named in the TRD (a Google API or OAuth client is expected; HTML-to-Markdown reuses 0.5.0's turndown).
- No test touches the network or a real Gmail account; Gmail and Claude responses come from fixtures.

## 8. Out of scope (KIV)
- **Job-alert intake and the Freelance jobs page** (§6.4–6.5, ADR 0037 design, ADR 0041 deferral). Naresh sets up Upwork and Freelancer.com alerts first so real samples exist.
- **Freelance-jobs module:** job statuses and pipeline (CRM), Claude-drafted proposals, bidding, analytics on the dataset (skills, budgets, trends), and CSV export.
- Re-extracting the whole jobs history at once after an extraction-prompt change.
- An editable extraction prompt in Settings.
- Gmail push notifications instead of polling.
- Marking processed emails in Gmail (a label such as `mnemosyne/processed`), which would need a write scope.
- A second Gmail account; other mail providers.
- Vault-searching wikilink agent (planned as its own version, with the agent runtime decision).
- Business-idea-validator tab; AI tutor.
- A spend summary built on recorded usage; Claude API Workload Identity Federation; OPML import/export; a per-feed model override.

## 9. Open questions
None. Changed after drafting:
- 2026-10-20: job-alert intake and the Freelance jobs page deferred to a later version (ADR 0041).

Decided while drafting:
- Gmail API with OAuth, read-only scope; a Connect Gmail button in Settings, no app login.
- Each source has one destination, Newsletter or Freelance jobs, fixed at creation.
- A source matches by one or more Gmail labels or by a Gmail search.
- Newsletter sources can backfill past emails into the inbox (default 30 days, never auto-summarized); jobs sources don't backfill.
- Job alerts are split into postings by Claude extraction, not per-platform parsers.
- Jobs are stored as fixed columns plus a flexible JSON record plus the raw email, in SQLite (no separate document database).
- Newsletter notes link to the email in Gmail as their `source`.
- One combined Inbox on the home page for feed and newsletter items.
- Gmail sources share the feed check interval.
- Job extraction defaults to Haiku, changeable in Settings.
