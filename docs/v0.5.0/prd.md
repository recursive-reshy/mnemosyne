# Mnemosyne v0.5.0 — Product Requirements

## 1. Summary
v0.5.0 makes Mnemosyne ingest more than videos. Naresh can submit an article URL and get the same summary note in the same review queue, paste an article's text when the page can't be read, and subscribe to RSS feeds so new posts arrive on their own. Every source goes through one internal "source adapter" contract, so a Gmail adapter (newsletters and freelance-job alerts) can be added later without reworking the pipeline. The release also fixes timestamp caret sync on the review screen, a known issue since 0.3.0.

## 2. Background
Up to 0.4.0 Mnemosyne only accepts video URLs: yt-dlp, ffmpeg and Whisper produce a timestamped transcript, and Claude summarizes it with a prompt profile. A lot of what Naresh reads is written (Medium posts, blogs, Substack and Ghost newsletters), and that knowledge never reaches the vault. Most blogs and newsletter platforms publish an RSS feed, which can be read with no account or authentication; email-only newsletters need Gmail, which is a much larger piece of work and is deferred (§8). Getting the vault filled now also feeds the parked tutor, wikilink-agent and idea-validator modules.

## 3. Goals
- Submit an article URL and get a reviewed summary note in the vault, exactly as with a video.
- Paste the text of an article the app can't read (paywall, login, odd page), keeping its URL as the source.
- Subscribe to RSS or Atom feeds in Settings and have new items appear in Mnemosyne on their own.
- Pick a prompt profile per feed, so a coding blog is summarized with Coding and a business newsletter with Business ideas.
- One source-adapter contract behind every source (video, article, pasted text, feed item), ready for Gmail.
- Clicking or moving the cursor onto a timestamp in the note scrolls the transcript there, in a real browser.

## 4. Non-goals
- **No Gmail, no email newsletters, no freelance-jobs intake.** Those come with a Gmail adapter in a later version (§8).
- No logging in to sites, no cookies, no bypassing paywalls. A page the app can't read is handled by pasting its text.
- No PDFs, no images or tables from articles, no comments, no X/Twitter threads.
- No change to the note's sections (Summary, Key points, Notable quotes) or to the review, folder-picker and save flow.
- No feed reader: Mnemosyne doesn't show feed items for reading, only for summarizing.
- No OPML import or export of feeds.

## 5. User flow
1. **Submit an article.** On the home page the field is now "URL". Mnemosyne detects whether it is a video (YouTube and the other hosts listed in TRD) or an article, shows which it detected as a small "Video / Article" switch under the field, and Naresh can flip it if the guess is wrong. The profile and model selects work as in 0.4.0. The button reads "Transcribe" for a video and "Summarize" for an article.
2. **Paste instead.** Under the field, "Paste text instead" opens a large text box. Naresh pastes the article's text (the URL stays required as the source) and submits. If a submitted article fails because the page couldn't be read, the failed job offers **Paste text**, which opens the same box and continues that job.
3. **Review an article.** The review screen is the same as for a video, except the left pane shows the article's text instead of the transcript, and the note has no timestamps.
4. **Subscribe to a feed.** Settings gets a **Feeds** section. Naresh adds a feed by URL (a feed URL, or a page that links to its feed), sees its title and latest item, and picks its prompt profile. Feeds are checked on a schedule and with **Check now**.
5. **New feed items.** New items wait in a **From feeds** inbox on the home page, each with its feed's name, title and date, and **Summarize** and **Dismiss**. Nothing is fetched, transcribed or summarized until Naresh picks one. Summarize turns it into a normal job (§6.5). A feed can be switched to summarize its items automatically.

## 6. Features

### 6.1 Article from a URL
As Naresh, I want to summarize an article the same way I summarize a video.
- [ ] Submitting an article URL fetches the page, extracts the main text (title, author, site name, publish date when present) and drops navigation, ads and footers.
- [ ] The job shows progress as **Fetching** then **Summarizing**, then goes to review as videos do. No download, conversion or transcription steps.
- [ ] If the page can't be fetched, isn't HTML, or yields too little text to be an article (TRD sets the threshold), the job fails with a plain reason ("The page needs a login or is paywalled", "Not an article page", "Couldn't reach the site") and offers **Paste text** (§6.2).
- [ ] An article over the size the summarizer accepts fails with a clear message rather than being cut silently.
- [ ] Profile and model choices, regenerate, retry, usage and cost all work as in 0.4.0.

### 6.2 Pasted text
As Naresh, I want to summarize an article the app can't read.
- [ ] "Paste text instead" on the submit form takes the URL plus pasted text. The URL is the note's source; no fetch is made.
- [ ] **Paste text** on a failed article job opens the same box and continues that job, keeping its URL, profile and model.
- [ ] Pasted text is plain text or Markdown, up to the same size limit as §6.1. Empty or very short text is refused before submitting.
- [ ] An optional Title field sits above the text. Left empty, the title is the text's first heading, else its first line; it can be edited in review as today.

### 6.3 Video or article detection
- [ ] Known video hosts are treated as videos, everything else as articles. The switch under the URL field shows the guess and lets Naresh override it for this submission.
- [ ] A feed item is detected the same way, so a YouTube channel's feed produces video jobs.

### 6.4 Article notes
- [ ] Same sections as a video note. Key points and quotes carry no timestamps; quotes must still be word for word from the article, and ones that aren't are dropped as today.
- [ ] Front-matter keeps `title`, `source`, `created` and `tags` (with the locked `mnemosyne` tag). For articles it has `author`, `site` and `published` (each only when known) instead of `channel` and `duration`. The properties panel in review shows these read-only for articles, as it does `channel` and `duration` for videos.
- [ ] The fixed instructions the app sends to Claude have an article version that talks about an article and has no timestamps. Settings shows both, read-only. Prompt profiles are shared across sources.

### 6.5 RSS feeds
As Naresh, I want new posts from the blogs and newsletters I follow to arrive without me pasting links.
- [ ] Settings → Feeds lists each feed with its name, URL, prompt profile, last checked time, last error if any, and an on/off switch.
- [ ] **Add feed** takes a URL. A feed URL (RSS or Atom) is used directly; a web page is searched for the feed it links to. The app reads the feed before saving it and shows its title and latest item; a URL with no feed is refused with a message.
- [ ] The feed's name defaults to the feed's title and can be renamed. Its prompt profile defaults to the default profile and can be changed; its model is the default model.
- [ ] Adding a feed doesn't import its back catalogue. Only items published after it was added reach the inbox. (TRD may allow importing the latest one, so Naresh can see a feed work straight away.)
- [ ] All enabled feeds are checked on a schedule (the interval is a setting, default every hour) and on **Check now**, for one feed or all.
- [ ] An item already seen is never added again, even if the feed reorders or edits it.
- [ ] If a feed includes the full text of an item, that text is used; otherwise the item's link is fetched as in §6.1.
- [ ] A check adds at most a set number of new items per feed (the cap is in TRD), so a feed that republishes its history doesn't flood the inbox or, for an automatic feed, the API bill. Items over the cap are marked seen and skipped, and the feed shows how many were skipped.
- [ ] A feed that fails (unreachable, invalid) shows the error and keeps being retried at the normal interval. Turning a feed off stops checks; deleting it stops checks and leaves its jobs and notes alone.
- [ ] Feed jobs show the feed's name in the job list and on the review screen.

### 6.6 Feed inbox
As Naresh, I want to choose which feed items are worth summarizing, so I don't pay for the ones I don't want.
- [ ] New items from feeds land in a **From feeds** inbox on the home page, newest first, showing the feed name, item title, date and a link to the original.
- [ ] **Summarize** turns an item into a job with the feed's profile and the default model, which Naresh can change for that item as on the submit form. **Dismiss** removes it from the inbox. Both can be applied to several items at once.
- [ ] Nothing is fetched, transcribed or summarized, and no tokens are spent, while an item is in the inbox.
- [ ] Inbox items don't expire. Once summarized, the job follows the normal 24-hour review expiry.
- [ ] Each feed has a **Summarize automatically** switch, off by default. When on, its new items skip the inbox and become jobs straight away (still subject to the per-check cap in §6.5).
- [ ] Turning a feed off or deleting it leaves its inbox items in place; deleting a feed asks whether to remove them too.

### 6.7 Source adapters
- [ ] Every source (video, article, pasted text, feed item) produces the same normalized source record for the rest of the pipeline: title, source URL, author or channel, published date, text or timestamped segments, and the source type.
- [ ] Summarizing, review, regenerate, usage, saving and expiry don't depend on where a job came from beyond what that record carries.
- [ ] Adding a new source later (Gmail) means adding an adapter, not changing the job, summary or review code. TRD and an ADR record the contract.

### 6.8 Caret sync fix
As Naresh, I want the transcript to follow the timestamp I'm on in the note.
- [ ] In rich-text and source mode, clicking a timestamp or moving the cursor onto a line with one scrolls the transcript to that point and highlights it, as the 0.2.0 textarea did.
- [ ] It works in a real browser (Chrome and Safari on the Mac), not only in the tests. The fix includes a browser-level test that would have caught the 0.3.0 failure.
- [ ] Article notes have no timestamps, so nothing scrolls for them.

## 7. Constraints
- Single user, local, as before. Feeds, seen items and settings live in the existing SQLite database; existing jobs and notes carry over unchanged.
- The server fetches pages and feeds itself, over http(s) only, with timeouts and size limits, identifying itself with a plain user agent. No headless browser.
- New dependencies only as named in the TRD (an HTML-to-article extractor and a feed parser are expected).
- Feed checks run in the existing server process; nothing new runs on the host.

## 8. Out of scope (KIV)
- Gmail adapter: email newsletters, and freelance-job alert intake for the freelance-jobs module.
- Vault-searching agent that adds `[[wikilinks]]` to related notes.
- Business-idea-validator tab; AI tutor; freelance-jobs module.
- A spend summary (per month, per model) built on recorded usage.
- Claude API Workload Identity Federation instead of an API key.
- Lazy-loading the editor; wikilinks shown as plain text in rich mode.
- OPML import/export; a per-feed model override.

## 9. Open questions
None. Decided while drafting:
- Feed items wait in an inbox, with an optional per-feed **Summarize automatically** switch (§6.6).
- Inbox items don't expire; a job made from one has the normal 24-hour review expiry (§6.6).
- Article front-matter uses `author`, `site` and `published` (§6.4).
