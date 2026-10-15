# Checkpoint E plan: Phase 7 (web features)

## Context
Checkpoints A–D left the server complete and the web app on TanStack Query, React Router and typed API functions for every endpoint. Checkpoint E builds what a user sees: the job list on the home page, and the review screen at `/jobs/:id` where the summary is edited next to the transcript and saved to the vault, discarded, or retried. ADRs: 0011 (plain CSS modules), 0013, 0015, 0016. TRD §9 defines the hooks and components. Test-first per task; one commit each, pushed; after each task run `test`, `lint`, `typecheck` in `apps/web` (and in `packages/shared` and `apps/server` for the two tasks that touch them). No new dependencies.

## Points to confirm
1. **Two small pure helpers move to `packages/shared`**: `normalizeTag` (now in the server's `summary.cleanup.ts`) in 7.4, and `formatClock` (now in the server's `formatters/timestamps.ts`) in 7.5. The tag input and the transcript timestamps need exactly the server's rules, and `packages/shared/CLAUDE.md` allows pure functions both apps use. The alternative is duplicating them in the web app, which can drift. The server imports them from shared afterwards; their tests move with them.
2. **The save confirmation is router state** (`navigate( '/', { state: { savedPath } } )`), shown on the home page as a status line. It disappears on refresh, which fits "a confirmation".
3. **Every job in the home list links to `/jobs/:id`**, including in-progress ones, because progress lives on that page.
4. **Discard is one click, no confirm dialog** (the PRD asks for a button and an immediate list update). It deletes the job and transcript for good. Say if you want a confirm step.
5. **Route components own navigation.** `JobPage` passes `onSaved( path )` / `onDiscarded()` callbacks into the review screen, so the router rule in the web `CLAUDE.md` stays as written.
6. **7.10 (styling) can't be checked visually in this session**: no browser tool is available. I'll build it from the existing tokens in `global.css` (light and dark, mobile-first, two columns from 48 rem) and the task will be ticked on tests, lint and a successful build, with the visual check left for you.
7. **The page gets wider on the review route** (about 64 rem instead of 40 rem) so the two columns fit; the home page content keeps its current width.

## Tasks

### 7.1 `useJobs` + `JobList` on the home page
- Files: `src/hooks/useJobs.ts` + test, `src/expiry.ts` + test (`formatExpiry( expiresAt, now )`), new `src/components/JobList/` (`JobList.tsx`, `.module.css`, `.test.tsx`, `index.ts`), `HomePage.tsx` + test, `apps/web/CLAUDE.md`.
- Tests first:
  - `useJobs` polls every 2 s while any job is queued, downloading, converting, transcribing or summarizing, every 30 s otherwise; keeps the last list on a transient error; shares the `['jobs']` cache entry.
  - `formatExpiry`: "expires in 5h" (rounds up to whole hours above 90 min), "expires in 20m", "expiring now" under a minute, "expired" past it.
  - `JobList`: a list named "Jobs" with one item per job, showing the title (or the URL while untitled), a status label from one typed map (Queued, Downloading, Converting, Transcribing, Summarizing, Ready for review, Summary failed), the expiry text for review and failed-summary jobs, and a link to `/jobs/:id`; nothing rendered for an empty list.
  - `HomePage` shows the list under the form when jobs exist.
- Code: `useJobs()` returns `{ jobs, error }`; `JobList` takes `jobs` and `now` props.

### 7.2 Review page shell
- Files: new `src/components/ReviewScreen/`, `JobPage.tsx` + test, `apps/web/CLAUDE.md`.
- Tests first: `JobPage` shows progress for queued through summarizing; for `ready_for_review` it shows a review layout with the job title as a heading, a "Summary" region (read-only text for now) and a "Transcript" region placeholder, plus the existing download links; for `summary_failed` it shows the failure reason in an alert with downloads and no editor; for `saved` it shows "Saved to <path>" with a link home; `failed` keeps today's retry.
- Code: `ReviewScreen` (layout only), JobPage chooses a layout by status.

### 7.3 `TitleField` + `FilenamePreview`
- Files: new `TitleField/` and `FilenamePreview/` components, `ReviewScreen`.
- Tests first: `TitleField` is a labelled "Title" input that reports changes; `FilenamePreview` shows `Mnemosyne/<noteBasename( title )>.md` and updates as the title changes (invalid characters removed, `Untitled` when blank); the review screen starts with the job's title.
- Code: reuse `noteBasename` from `@mnemosyne/shared`.

### 7.4 `TagInput` (and `normalizeTag` to shared)
- Files: `packages/shared/src/tags.ts` + test (moved), server `summary.cleanup.ts` and `note.formatter.ts` import it, new `TagInput/` component, `ReviewScreen`.
- Tests first: shared `normalizeTag` cases (moved from the server tests); `TagInput` always shows a fixed `mnemosyne` chip with no remove button; suggested tags show as removable chips ("Remove tag rust"); Enter or comma adds a tag normalized with `normalizeTag`; duplicates, empties and `mnemosyne` are ignored; Backspace on an empty field does not remove chips.
- Code: controlled component (`tags`, `onChange`); server and shared tests stay green.

### 7.5 `SummaryEditor` + `TranscriptPane` (and `formatClock` to shared)
- Files: `packages/shared/src/clock.ts` + test (moved), server formatters import it, `src/hooks/useTranscript.ts` + test, new `SummaryEditor/` and `TranscriptPane/`, `ReviewScreen`, `JobPage`.
- Tests first: shared `formatClock` cases (moved); `useTranscript( id )` fetches once, no polling, under `jobKeys.transcript`; `SummaryEditor` is a labelled "Summary" textarea holding raw Markdown and reporting changes; `TranscriptPane` shows "Loading transcript…", an alert on failure, or the transcript's paragraphs (via `groupParagraphs`) each with a `[clock]` stamp and an id per start second; the pane appears in both the review and the failed-summary layouts.
- Code: the pane is a scrollable region.

### 7.6 `useDraft`
- Files: `src/hooks/useDraft.ts` + test, `ReviewScreen`, `apps/web/CLAUDE.md`.
- Tests first: starts from `initial`; changes are mirrored to `localStorage['mnemosyne:draft:<jobId>']`; a stored draft that parses as `{ title, tags, body }` wins over `initial` on mount; an invalid stored value is ignored; storage throwing on read or write never breaks the hook; `clear()` removes the key and resets to `initial`; a draft is not restored for a job that is gone (the page clears it on a 404).
- Code: `useDraft( jobId, initial )` returns `{ draft, setTitle, setTags, setBody, clear }`; the review screen binds the three fields to it.

### 7.7 Save
- Files: `src/hooks/useSaveJob.ts` + test, `ReviewScreen`, `JobPage`, `HomePage` + tests.
- Tests first: `useSaveJob` calls `saveJob( id, { title, tags, body } )` and waits for the server, then invalidates `['jobs']`, clears the draft and calls `onSaved( path )`; failure shows the server's message in an alert and keeps the draft; the Save button reads "Saving…" and is disabled while pending or when the title is blank; the tags sent include the fixed `mnemosyne`; `JobPage` navigates home with the path and `HomePage` shows "Saved to Mnemosyne/…".
- Code: mutation hook; navigation stays in `JobPage`.

### 7.8 Discard and Retry summary
- Files: `src/hooks/useDiscardJob.ts` + test, `src/hooks/useRetrySummary.ts` + test, `ReviewScreen`, `JobPage`.
- Tests first:
  - Discard removes the job from the `['jobs']` cache immediately; on failure it restores the list and shows the error; on success it clears the draft and calls `onDiscarded()`.
  - Retry sets the cached job to the returned job (`summarizing`) and invalidates; the page then polls again and shows progress; failure shows the message.
  - The Discard button exists in the review and failed-summary layouts; Retry only in the failed-summary layout.
- Code: optimistic `onMutate` / `onError` rollback / `onSettled` invalidate.

### 7.9 Caret sync
- Files: `src/timestamp.ts` + test (`parseTimestampSeconds( line )`), `SummaryEditor`, `TranscriptPane`, `ReviewScreen`.
- Tests first: `parseTimestampSeconds` reads `[12:34]`, `[1:05:20]` and `([12:34](https://…))`, takes the first stamp on the line, and returns `null` for none; `SummaryEditor` reports the text of the line under the caret on select; the pane scrolls to the paragraph at or before that second (the last paragraph that starts before it), marks it with `aria-current`, and does nothing when there is no stamp.
- Code: scrolling sets the pane's `scrollTop`, so the page does not jump.

### 7.10 Styling pass
- Files: `.module.css` for `JobList`, `ReviewScreen`, `TitleField`, `FilenamePreview`, `TagInput`, `SummaryEditor`, `TranscriptPane`; `App.module.css`; `global.css` only if a token is missing.
- No new behaviour, so no failing test first; the existing suite is the guard. Rules: the existing tokens only, light and dark, a single column under 48 rem and two columns above, visible focus, a marker besides colour for the current transcript paragraph, buttons grouped at the bottom with Discard visually secondary.

## Verification
- Per task: new tests fail first for the stated reason, then pass; `pnpm test`, `lint`, `typecheck` in `apps/web` (plus `packages/shared` and `apps/server` for 7.4 and 7.5).
- End of checkpoint: root `pnpm test`, `lint`, `typecheck`, `build`.
- Behaviour check without a browser: serve the built app with the server, seed a `ready_for_review` job in the database, and with `curl` confirm the endpoints the review screen calls (`GET /api/jobs`, `/transcript`, `POST /save`, `DELETE`) and that `/jobs/<id>` serves the app. The rendered look (7.10) is for you to check; I'll say so in the report.
- Report: tasks with commit hashes, per-folder results, existing tests changed, and anything not verified.
