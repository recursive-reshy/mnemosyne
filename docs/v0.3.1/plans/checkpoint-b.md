# Plan — Checkpoint B (Phases 2–3: home and job screens), tasks 2.1–3.3

## Context
Checkpoint A put the MUI theme and app shell in place. Checkpoint B converts the home screen (`SubmitForm`, `JobList`, `HomePage`) and the job screen (`JobProgress`, `DownloadLinks`, `JobPage`) from CSS modules to MUI. Behaviour-neutral: the existing tests are the regression net and stay unchanged (TRD §8) except the single query swap noted in 3.3. Web only. `global.css` stays (its `.alert` class and base styles are still used by the review components until checkpoint C). Each task deletes its `.module.css`.

Every task: failing test first → green → refactor → tick Status + log line → commit → push; then `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`.

## How "test first" works in a behaviour-neutral migration
The existing tests already pin behaviour, so they stay green throughout and don't give a red. For each task I add one small new test that pins something MUI-specific the old markup didn't have, and watch it fail first (red), then convert (green) and confirm the old tests still pass unchanged. The new tests are listed per task. Where a conversion has nothing new to pin, I say so and rely on the existing tests plus a pre-check that they fail if the component is broken (e.g. renaming a label), but I don't invent tests for the sake of it.

## Phase 2 — Home

### 2.1 `SubmitForm`
- Convert to `Box component="form"` (keeping `aria-label="Transcribe a video"`, `noValidate`, `onSubmit`), `TextField` (`label="Video URL"` → real `<label>`, `type="url"`, `fullWidth`, placeholder, `autoComplete="off"`, `disabled`, `error={ validationMessage !== null }` so MUI sets `aria-invalid`, `slotProps.htmlInput['aria-describedby']` = message id), `Button type="submit" variant="contained"` and `Alert severity="error" id={ messageId }` (default `role="alert"`). Delete `SubmitForm.module.css`.
- New test (red first): the alert is an MUI alert with the error severity, i.e. `screen.getByRole( 'alert' )` has class `MuiAlert-standardError`… no: class assertions are banned by `CLAUDE.md`. Instead pin what the old markup couldn't: the label is associated through MUI's `<label for>` and the input is not marked invalid for a server error (only for a validation message). That is already partly covered; the only real new behaviour is "a server `error` prop does not set `aria-invalid`" — add that test (it passes today, so it is a guard, not a red). Honest note in the log: no red available for 2.1 beyond the conversion breaking nothing.
- Existing `SubmitForm.test.tsx` and `HomePage.test.tsx` must pass unchanged.

### 2.2 `JobList`
- `List` (`aria-label="Jobs"`, `disablePadding`) of `ListItem`s (render `<ul>`/`<li>` so `list`/`listitem` roles stay), each an outlined row: title as MUI `Link component={ RouterLink } to=…` (a real anchor), status as `Typography` (`fontWeight` 600) from the same `STATUS_LABELS` map, expiry as secondary `Typography`. Text, the `EXPIRING_STATUSES` rule and `formatExpiry` unchanged. Delete `JobList.module.css`.
- Existing `JobList.test.tsx` unchanged and green.

### 2.3 `HomePage`
- `Stack spacing` with `maxWidth: '40rem'`; the "Saved to …" line becomes `Alert severity="success" role="status"` (it keeps the status role; colour is not the only cue because the alert has an icon and text). Delete `HomePage.module.css`.
- Existing `HomePage.test.tsx` unchanged and green.
- **Browser check after 2.3** (dev server with the API behind it): home in light and dark, wide and narrow, with the jobs list, a validation error and the saved banner. Screenshots for the report.

## Phase 3 — Job

### 3.1 `JobProgress`
- Keep the element structure the tests rely on: a `section` (`aria-label="Job progress"`), the URL line, `role="status"` text, a list of six items with `role` `listitem`, `aria-current="step"` and `data-state` (`complete` / `current` / `pending`) on each. Use `List component="ol"` + `ListItem` with an icon (`CheckCircle` complete, `RadioButtonChecked` current, `RadioButtonUnchecked` pending) and text; labels exactly as today so `textContent` matches. No `Stepper` (its DOM has no `listitem`s; swapping would force test changes). Optional `LinearProgress` is skipped for the same reason; it would add nothing the stage list doesn't say.
- Failure and connection errors: `Alert severity="error"` (default `role="alert"`; connection text `"<error>. Retrying…"`), `Button variant="contained"` "Try again". Delete `JobProgress.module.css`.
- State is shown by icon and text, not colour alone.
- Existing `JobProgress.test.tsx` unchanged and green.

### 3.2 `DownloadLinks`
- `section aria-label="Download transcript"` (stays a `region`) with a `Stack direction="row" flexWrap`. Each format is a MUI `Button component="a" href={ downloadUrl( … ) } download` (a real anchor so `link` role, `href` and `download` attributes survive); Markdown is `variant="contained"`, the others `outlined`. List semantics: keep a `ul` of `li`s only if the existing test needs it (it queries `link` inside the region, so a `Stack` is enough). Delete `DownloadLinks.module.css`.
- Existing `DownloadLinks.test.tsx` unchanged and green (it renders without a `ThemeProvider`, so the default MUI theme must be fine).

### 3.3 `JobPage`
- `Alert severity="error"` for the load error and the retry error; the loading line stays `Typography role="status"`; the saved line becomes `Alert severity="success" role="status"`; buttons become MUI `Button`s ("Start over", "Transcribe another video"). Fragments get a `Stack` where spacing is needed. `JobPage` has no CSS module to delete.
- **One test change, listed in the log (TRD §8 allows a query swap for an equivalent role query):** `JobPage.test.tsx` "shows a failed retry and stays on the old job" does `findByText( … )` and expects `role="alert"` on that element; MUI renders the text in an inner `div` inside the `role="alert"` root, so it becomes `await screen.findByRole( 'alert' )` with `toHaveTextContent( 'Could not reach the server' )`. Same intent, nothing else touched.
- Everything else in `JobPage.test.tsx` unchanged and green.
- **Browser check after 3.3:** job page in progress (e.g. a `downloading` job), failed, and reached-from-review states where reproducible; light and dark. Screenshots for the report.

## Critical files
Edit: `components/{SubmitForm,JobList,HomePage,JobProgress,DownloadLinks,JobPage}/*.tsx`, `docs/v0.3.1/tasks.md` (ticks and log lines), one assertion in `JobPage.test.tsx`.
Delete: `SubmitForm.module.css`, `JobList.module.css`, `HomePage.module.css`, `JobProgress.module.css`, `DownloadLinks.module.css`.
Reuse: `formatExpiry` (`src/expiry.ts`), `downloadUrl` (`api/jobs.api`), `renderWithClient` (already wraps in the theme), `jobFixture`. Imports by path (`@mui/material/Button`) as in checkpoint A.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web` green; only the one named assertion in `JobPage.test.tsx` differs from 0.3.0.
- Browser checks after 2.3 and 3.3 (scripted Chromium via a throwaway `playwright-core` in the scratchpad, as in checkpoint A), light and dark. `pnpm build` at the end.
- Report: tasks with hashes, results per folder, screenshots, the query swap, deferred items.

## Risks
- MUI `Alert` has `role="alert"` on the root with an inner message `div`, so any test using `getByText` on alert text and then asserting the role would break; only the one noted case exists today (I grepped the five components' tests).
- `Button component="a"` plus `download` must keep the anchor semantics: the `link` role query in the existing test verifies this.
- Until phase 5, `global.css` `button` and `input` base styles still apply to MUI's elements where selectors are unscoped (`button`, `input`, `a`). If that visibly clashes (e.g. double borders on MUI inputs), I'll scope the offending rule in `global.css` rather than change behaviour, and log it. This is the main thing the browser check is for.
