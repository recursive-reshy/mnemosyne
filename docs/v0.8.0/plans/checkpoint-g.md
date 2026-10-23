# Checkpoint G plan: Phase 8, review screen and Settings (tasks 8.1–8.4)

## Context
Checkpoints A–F built Melete's contracts, data, scanning, generation, scheduling, the review API and the Today / Subject / Note pages. Today's **Start review** and **Review** links already point at `/melete/review` (they fall back to `/` until the route exists). Checkpoint G builds the review screen itself, the phone-width browser tests, and the Melete entries in Settings. It is web-only: no server or shared change is expected. If one turns up, stop and ask.

Already available (reuse, don't rebuild):
- `api/melete.api.ts` (all twelve calls); hooks `useNextReview( subjectId | null )` (no polling, `gcTime` 0), `useGradeAnswer`, `useRecordReview` (invalidates `meleteKeys.all` on success), `useDropQuestion`; `useSettings` (`melete_review_mode`, `melete_*_model`, `melete_*_profile_id`, `locked_instructions.melete_*`); `useModels`.
- `test-support/melete.fixture.ts`, `test-support/hookStates.ts`, `renderWithClient( { route, path } )`.
- `LinkingSettings` (model select pattern), `LockedInstructions`, `PromptEditor`, `PromptHistory`, `PromptPanel` (already handles the non-summary `linker` prompt).

ADRs read: 0056 (FSRS, ratings), 0055 (Melete in Express, grading never blocks), 0060 (phone-first, no service worker). TRD §11.3–11.4 and §13.2 govern.

## 8.1 `RatingBar` (ADR 0060)
Files: `components/RatingBar/{RatingBar.tsx,RatingBar.test.tsx,index.ts}`.
- Props: `selected: MeleteRating | null`, `disabled`, `onSelect( rating )`, `onConfirm( rating )`. Four equal-width buttons (Again, Hard, Good, Easy), `minHeight: 48`, `position: sticky; bottom: 0`, `paddingBottom: env( safe-area-inset-bottom )`, opaque background (`background.default`) so content doesn't show through.
- Pre-selection is shown as selected (`aria-pressed`); a **Next** button confirms it; tapping the already-selected rating confirms; tapping another selects. With nothing selected, tapping a rating selects it and Next is disabled.
- Desktop keys on `document` while mounted: 1–4 select, Enter confirms when something is selected; ignored when focus is in a text field / textarea (so typing "1" or Enter in the answer box does nothing here). The key handler is the only effect; it lives in the component (a `useEffect` with cleanup), since it is local UI wiring.
- Tests first (jsdom): renders four named buttons; preselected one is pressed; click selects another then Next confirms with it; tapping the selected one confirms; Next disabled with no selection; keys 1–4 and Enter; keys ignored inside a textarea; disabled blocks everything. Red: module missing. Green after the component.

## 8.2 `MeleteReview` (ADR 0056)
Files: `components/MeleteReview/` (screen: reads `?subject=` with `useSearchParams`, owns navigation), plus small components, each under ~150 lines:
- `ReviewHeader` (subject name, progress "N done · M left" from `counts`, `ToggleButtonGroup` Typed / Quick, overflow menu with **Drop question**, close link to `/melete`).
- `TypedAnswer` (multiline `TextField` labelled "Your answer", autofocus on desktop only via `useMediaQuery( theme.breakpoints.up( 'md' ) )`, **Check** with progress while grading, answer stays visible and read-only after checking).
- `GradeFeedback` (`graded`: verdict chip (text + icon, not colour alone), **Right** and **Missed** lists, feedback line, reference answer, collapsible passage, **Open in Obsidian** when `obsidian_url`; `skipped`: reference answer and passage, no feedback; `failed`: info `Alert` "Couldn't grade this one; rate it yourself" plus the reference answer).
- `QuickAnswer` (**Show answer**, then reference answer and passage).
- Route `melete/review` added to `routes.tsx` by this task (as the plan for F agreed); the `routes` test case in `App.test.tsx` gets the new path.
- State, derived during render where possible: the typed text and the grade result are keyed by `item.question.id` (reset when the item changes, as `PromptPanel` does for edits), the chosen rating, and the revealed flag for quick mode. Mode starts from `settings.melete_review_mode` and is sent as `mode` with each review (the server stores it; no separate settings call). Toggling mid-question applies from the next question (TRD §11.3), so the current question keeps the mode it started in.
- Flow: mount → `useNextReview( subject )`. Typed: Check → `gradeAnswer` → `graded` pre-selects `suggested_rating`, `skipped` pre-selects `again`, `failed` pre-selects nothing. Rating bar confirm → `recordReview( { rating, mode, answer?, grade_run_id?, suggested_rating? } )` → next item comes from the invalidated `useNextReview` query. Quick: Show answer → rating bar. Rating bar is visible only after the answer is revealed (typed: after Check returns; quick: after Show answer).
- Drop: `useDropQuestion` then refetch next item (`dropQuestion` already invalidates `meleteKeys.all`).
- `item: null`: "All done for now", with the next due time if the API gave one (the current `GetNextReviewResponse` carries none, so the line is left out and noted in the log), and a link back to Today. Loading and error states as the other Melete pages. Errors on grade/record show an `Alert` (`role="alert"`); a failed record keeps the rating selected so Next can be retried.
- Layout: one column, `maxWidth: '40rem'`, centred; no horizontal scroll (long words wrap with `overflowWrap: 'anywhere'`).
- Tests first (jsdom, hooks mocked at the `api/` boundary like the other Melete pages): typed graded path (Check → "Missed" list → Hard pre-selected → Next sends `rating hard`, `mode typed`, `grade_run_id`, `suggested_rating`); picking a different rating sends that one; blank answer → skipped → Again pre-selected; grade `failed` → alert, nothing pre-selected, reference answer shown; quick path (Show answer → Good → sent with `mode quick`, no grade call); mode toggle persists to the next review; drop moves on; all-done state; error states; the route renders from `renderWithRouter( '/melete/review?subject=…' )`. Red: component missing / route falls back to `/`.

## 8.3 `MeleteReview.browser.test.tsx` (ADR 0060)
File: `components/MeleteReview/MeleteReview.browser.test.tsx`, Chromium and WebKit, mocking hooks like `PromptsTab.browser.test.tsx`.
- At 390×844 and 1280×800 (`page.viewport`), light and dark: no horizontal scroll (`document.documentElement.scrollWidth <= clientWidth`); with a deliberately long reference answer and passage so the page scrolls, the rating bar's bottom edge is inside the viewport; each rating button ≥ 44px tall (we ship 48).
- Red first by pointing at a sticky-less bar variant is not practical; instead write the test, confirm it fails if `RatingBar` is temporarily rendered non-sticky (checked once, not committed), then green.

## 8.4 Settings: Prompts tab and Models tab (ADR 0055)
- `api/prompts.api.ts` `listProfiles( purpose = 'summary' )` sends `?purpose=`. `usePromptProfiles` is unchanged (summary only, so every picker is untouched). New `useMeleteProfiles()` in `hooks/` lists `purpose=all`, keeps `melete_questions` and `melete_grading` rows, under a key `promptKeys.melete` that sits under `promptKeys.profiles` so existing `refresh` invalidation covers it.
- `PromptList` takes the Melete profiles: a third group **Melete** (after Linking) with "Melete questions" and "Melete grading" linking to `/settings/prompts/<uuid>`. Summary group and Linking group unchanged.
- `PromptPanel`: also looks the id up in the Melete profiles; for those it shows the editor, history and reset exactly as for the linker, and `LockedInstructions` from `locked_instructions.melete_questions` / `.melete_grading` (title "Instructions the app always sends for question generation / grading"). The summary video/article locked blocks stay summary-only. Not found → the existing redirect.
- `ProfileManager` is untouched: a Melete profile isn't in its summary list, so only **New profile** shows (rename/delete aren't offered; the server also refuses them).
- `ModelsTab`: a **Melete** section with `MeleteSettings` (new, modelled on `LinkingSettings`): **Question model** and **Grading model** selects from `useModels`, with the "model list is offline" notice, saved through `updateSettings` with `melete_question_model` / `melete_grading_model`. The review mode is not a Settings control (toggle on the review screen only).
- `apps/web/CLAUDE.md` updated in this task: routes line (`melete`, `melete/subjects/:subjectId`, `melete/notes/:noteId`, `melete/review`), component list (Melete pages, `RatingBar`, review parts, `MeleteSettings`), hooks (`useMeleteToday` … `useMeleteMutations`, `useMeleteProfiles`), the Melete drawer item, and the browser-test note.
- Tests first: `PromptList` shows the Melete group; `PromptPanel` for a Melete id shows the editor and its locked instructions and saves a version; `MeleteSettings` selects and saves both models (and the offline notice); `usePromptProfiles` unchanged; `listProfiles` test for the query string; `useMeleteProfiles` test. Red: missing group/section/modules.

## Per-task gate and commits
Each task: failing tests → green → refactor → tick Status and add a log line in `tasks.md` → one commit (`feat(8.1): RatingBar`, `feat(8.2): Melete review screen`, `test(8.3): …`, `feat(8.4): Melete prompts and models in Settings`) → push. Gate for `apps/web`: `pnpm test`, `pnpm test:browser`, `pnpm lint`, `pnpm typecheck`. Stage files by name.

## End of checkpoint
Run the dev server with the real server behind it (temp vault with a subject, enroll, generate), then screenshot Melete review, Prompts and Models at 390 px and 1280 px, light and dark, and say what I see. Run `pnpm e2e`. Report per the root `CLAUDE.md`: tasks with hashes, test/lint/typecheck per folder, e2e result, ADRs (none expected), anything deferred (the "next due time" line is deferred unless the API gains it).

## Open point flagged for approval
`GetNextReviewResponse` has no next-due time, so "All done for now" can't show one without a contract change (TRD §11.3 says "when known"). Plan: omit the time, do not change the contract.
