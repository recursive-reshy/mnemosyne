# Checkpoint D plan: Phase 7 (web articles)

Next: **Checkpoint D, task 7.1** (Plan cell ⬜). Checkpoints A, B and C are done. On approval: save this to `docs/v0.5.0/plans/checkpoint-d.md`, tick the Plan cell, commit `docs(plan): checkpoint D`, push, then start 7.1.

Read: PRD §5 and §6.1–6.4, TRD §8.1–8.4, ADRs 0030 and 0031, `tasks.md`, and the web code below. Only `apps/web` changes. Gate after every task: web `test`, `test:browser`, `lint`, `typecheck` (and `build` at the end). Existing tests pass unchanged except renames and fixture additions (TRD §9); each one is listed in the task's log line.

## Context
The server (checkpoint C) now accepts article URLs, pasted text, `source_type`, and `POST /api/jobs/:id/text`, and returns article sources. The web app still says "Transcribe a video", sends only a URL, and shows only transcripts. This checkpoint adds, in the order of the PRD user flow: the submit form (URL, a Video/Article switch, paste box), progress and the failed-article **Paste text** flow, and the review screen for an article (source pane, properties, downloads, job-list icon).

Current shape of the code: `SubmitForm.tsx` (98 lines) takes `onSubmit( url )`; `HomePage.tsx` builds the summary choices and calls `createJob( url, options )`; `JobPage.tsx` calls `createJob( url )` for **Try again** and renders `JobProgress` or `ReviewScreen`; `JobProgress.tsx` has fixed video stages; `ReviewScreen.tsx` renders `NoteEditor`, `PropertiesPanel` (Channel/Duration rows), `TranscriptPane` (video only) and `DownloadLinks` (md/srt/txt); `JobList.tsx` lists jobs with a status label.

## 7.1 Data layer (TRD §8.1)
- **Tests first:** `jobs.api.test.ts`: `createJob( body )` posts the whole `CreateJobBody` (including `source_type`, `text`, `title` when present, and nothing extra) and returns the job id; `submitPastedText( id, body )` posts to `/api/jobs/<encoded id>/text`, parses `{ job }`, and surfaces the server message and status on 400/404/409 (`ApiError`), and rejects a malformed response. `useSubmitPastedText.test.ts` (mocked `api/`, `renderHookWithClient`): the mutation calls the API with the job id; on success it writes the returned job into `jobKeys.detail( id )` and invalidates the job list; an error is exposed as `error.message`.
- **Code:** `createJob( body: CreateJobBody ): Promise< string >` (replaces `createJob( url, options )`); `submitPastedText`; `hooks/useSubmitPastedText.ts` modelled on `useRetrySummary.ts`.
- **Callers and tests that change with the signature:** `HomePage.tsx` and `JobPage.tsx` now pass `{ url, … }`; the existing `createJob` assertions in `jobs.api.test.ts`, `HomePage.test.tsx`, `JobPage.test.tsx` and `SubmitForm.test.tsx` change from `( url )` / `( url, options )` to the body object (mechanical, listed in the log).
- Commit `feat(7.1): create-job body and pasted-text mutation`.

## 7.2 Submit form (TRD §8.2)
- **New components:** `SourceTypeSwitch` (MUI `ToggleButtonGroup` "Video" / "Article"), `PastedTextFields` (optional "Title" field, multiline "Article text" with `minRows` 10, a character count against `ARTICLE_LIMITS.maxChars`, and a short-text message below `ARTICLE_LIMITS.minPastedChars`; it is controlled, so 7.3's dialog reuses it). `SubmitForm.tsx` stays under about 150 lines by delegating to them.
- **Tests first:**
  - `SourceTypeSwitch.test.tsx`: hidden while the field is empty; shows `detectSourceType( url )` (YouTube → Video, a blog URL → Article) and updates as the URL changes; clicking the other option overrides it; the choice holds while the URL is edited and resets when the field is cleared.
  - `PastedTextFields.test.tsx`: typing calls the handlers; the counter shows `n / 300,000`; the short-text message appears for 1–199 characters and not for 0 or ≥ 200; the text field is at least 10 rows.
  - `SubmitForm.test.tsx` (existing cases updated, new ones added): label "URL" and form name "Add a video or article"; button "Transcribe" for a video and "Summarize" for an article; the switch appears under the field; **Paste text instead** shows only for articles, reveals the fields, and collapsing clears the text; switching to Video while it is open closes and clears it; `onSubmit` receives `{ url }` for a plain video, `{ url, source_type: 'article' }` only when the choice differs from the detected type, and `{ url, text, title }` for pasted text (trimmed; title omitted when blank); invalid URL and too-short pasted text show an error and do not submit.
  - `HomePage.test.tsx`: `createJob` gets the form's body merged with the model/profile choices (only when they differ from the defaults, as now); an article submission navigates to the job.
- **Code:** as TRD §8.2; `HomePage` merges `summaryChoices` into the body.
- Commit `feat(7.2): submit form for videos and articles`.

## 7.3 Progress and Paste text (TRD §8.3)
- **Tests first:**
  - `JobProgress.test.tsx`: an article job shows the stages "Waiting to start", "Fetching the article", "Summarizing", "Ready for review" (no download/convert/transcribe), with `fetching` as the current step and the status text "Fetching the article…"; video stages unchanged; a failed article job shows its error, **Paste text** and **Try again**; a failed video job shows no **Paste text**.
  - `PasteTextDialog.test.tsx`: opens from the button; reuses `PastedTextFields`; **Summarize** is disabled below 200 characters; submitting calls `onSubmit( { text, title? } )` with trimmed values; shows a server error in an `Alert`; **Cancel** closes it; the text is kept after an error.
  - `JobPage.test.tsx`: pasting on a failed article job calls `submitPastedText` and the page follows the job into summarizing (the job query is refreshed and the progress shows "Summarizing"); **Try again** for an article sends the same `source_type` (so an article override on a video-looking URL is kept).
- **Code:** `JobProgress` picks its stages from `job.source_type`; new `PasteTextDialog` (MUI `Dialog`, built like `RegenerateDialog`); `JobPage` owns `useSubmitPastedText` and passes handlers down (components don't fetch).
- Commit `feat(7.3): article progress and Paste text`.

## 7.4 Review screen for articles (TRD §8.4)
- **Tests first:**
  - `SourcePane.test.tsx` (the renamed `TranscriptPane.test.tsx`; all video cases unchanged): for an article it shows the title, a link to the source (new tab, `rel="noopener noreferrer"`), and the Markdown as read-only pre-wrapped text in the body font; `focusSecond` is ignored; the region is named "Article" (the video one stays "Transcript"); loading and error states as before.
  - `PropertiesPanel.test.tsx`: an article note shows Author, Site and Published (each only when present) instead of Channel and Duration; a video note is unchanged.
  - `DownloadLinks.test.tsx`: Markdown only for articles (no `.srt`, no `.txt`), all three for videos.
  - `JobList.test.tsx`: each row has a video or article icon with an accessible name.
  - `ReviewScreen.test.tsx`: an article job passes the article source to the pane and no focus second; video caret sync unchanged (the browser test in `ReviewScreen.browser.test.tsx` must still pass).
  - `LockedInstructions.test.tsx` and `SettingsPage.test.tsx`: the page shows the video and the article texts, each read-only with its own heading (PRD §6.4: "Settings shows both"). `useSettings` returns `{ video, article }`.
- **Code:** rename `components/TranscriptPane/` to `components/SourcePane/` (`TranscriptPane` → `SourcePane`, prop `transcript` → `source: SourceDocument | null`); `PropertiesPanel` rows by which keys the note has; `DownloadLinks` takes `sourceType`; the job-list icon (MUI `OndemandVideo` / `Article`); `LockedInstructions` shows both texts.
- **Gap in the task list:** PRD §6.4 and TRD §5.4 say Settings shows both locked texts, but no task in `tasks.md` lists the web part. I'll do it here (small, covered by the PRD) and note it in the log line, unless you'd rather it moved.
- Commit `feat(7.4): article source pane, properties and downloads`.

## Checkpoint end and report
Web `test`, `test:browser` (both browsers), `lint`, `typecheck`, `build`. Browser checks as in earlier checkpoints: the real server on a scratch database (the built web app, a seeded article review job, a failed article job, fixture pages from a small local Node server, Claude pointed at a closed port), driven by Playwright in Chromium and WebKit, light and dark, wide and narrow, with screenshots of: the submit form with the switch and the open paste box, an article in review, a failed article with **Paste text** and its dialog, Settings with both locked texts, and the job list with the icons. I'll say what I saw. Nothing outside `apps/web` changes (server and shared untouched), so no ADR is expected.

## Risks and decisions to confirm
1. **`createJob` signature** changes to the body object (TRD §8.1); existing tests and two callers change mechanically.
2. **Settings page** shows both locked texts (see 7.4, a gap in the task list).
3. **Try again** on a failed article job keeps its type by sending `source_type` (the old code sent only the URL, which would turn an article override on a video-looking URL back into a video).
4. **Copy.** I'm leaving "Transcribe another video" and the other video-worded labels outside the form unchanged, since the TRD doesn't list them.
