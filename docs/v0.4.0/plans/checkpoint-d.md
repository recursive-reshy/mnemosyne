# Plan — Checkpoint D (Phases 7–8: web jobs, clean-up, verification), tasks 7.1–8.4

## Context
Checkpoints A–C built the data, server and Settings screen. Checkpoint D finishes the feature where it is used: pick a profile and model on the submit form (7.1), see how a summary was made and what it cost on the review screen (7.2), regenerate a summary with another profile or model (7.3); then docs, version 0.4.0, the final checks and the release notes (8.1–8.4). ADRs 0027–0029 govern; no new ADR expected.

Every task: failing tests first (watch them fail for the right reason) → least code → refactor while green → tick Status + log line → commit (`feat(<id>): …`, `docs(<id>): …`, `chore(8.2): …`) → push. After each: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web` (and the other packages for 8.2/8.3). No new dependencies. Files stay within the 150-line lint cap.

## Findings that shape the plan
- `SubmitForm` has three required props and its tests render it that way. 7.1 adds **one optional prop** (`options?: SummaryOptionsProps`); when absent nothing extra renders, so every existing `SubmitForm` test stays unchanged. TRD §7.4 says the form "gains `profiles`, `models` and the chosen values"; one optional object with those fields is the same thing.
- `HomePage.test.tsx` asserts `createJob` was called with just the URL and mocks only `jobs.api` and `useJobs`. So `HomePage` calls `createJob( url )` when nothing differs from the defaults and `createJob( url, options )` only when something does ("sends only values that differ from the defaults"), and the test file gets `vi.mock` lines for the three data hooks it now uses (a setup edit, listed in the log; no assertion changes).
- `ReviewScreen.test.tsx` mocks `useTranscript` and `useFolders` only. New hooks are used only by components that mount conditionally (`SummaryInfo` when `summary_usage` is not null; `RegenerateDialog` only while open), so existing tests with null usage never call them and need no edits.
- Regenerate vs autosave (TRD §7.5): `useAutosaveDraft` schedules a debounced PATCH and also flushes a dirty note when `ReviewScreen` unmounts, and once the job is `summarizing` that PATCH would be a 409. 7.3 adds `cancelPending()` to the hook: clears the timer and sets the "latest" values back to the last sent ones (so nothing is dirty, the unmount flush does nothing) and status `saved`. Tests: after an edit, `cancelPending()` then 1,500 ms and an unmount → `updateDraft` never called. An already in-flight PATCH is left to finish (it either lands before the regenerate or its 409 is ignored on an unmounting screen).
- Regenerate sends only what differs from the dialog's starting values (the job's stored model/profile, else the defaults), so an unchanged dialog sends `{}` and the server keeps the job's choices (a job that follows the defaults keeps following them).
- Model display names come from `useModels` (fallback to the id) in both `SummaryInfo` and the selects. Number/cost formatting is a pure module with its own table-driven tests (`formatSummaryInfo.ts`), kept out of the component.
- Versions: root, shared and server `package.json` are 0.3.0 and web is 0.3.1; 8.2 sets all four (and the README status line) to 0.4.0.
- The real 0.3.1 database lives in the Docker volume `mnemosyne_mnemosyne-data` (container `mnemosyne-mnemosyne-1`, running now). For 8.3's migration check I will only **copy** `/data` out with `docker cp` into the scratchpad (no change to the container or volume) and run the migrations on the copy. If Docker can't be used I'll say so and ask rather than guess.
- Browser checks (TRD §8): there is no browser-automation tool, but Chrome is installed and Node 24 has a built-in `WebSocket`, so a throwaway script in the scratchpad can drive Chrome over the DevTools protocol (load page, click, screenshot) with no new dependency. A job in review is created by inserting one through the server's own repository functions into a temporary database (no real video needed). This also lets me click through the dialogs and the Settings flows that checkpoint C could only unit-test. Screenshots: light and dark, wide and narrow.
- The real check with Naresh (one real video on Sonnet with Business ideas, regenerate with another profile and model, compare cost with the console) can't be done by me. 8.3 stays 🟨 and is reported, not ticked, as the task says.

## Phase 7 — Web jobs

### 7.1 `SummaryOptions` on the submit form (ADRs 0027, 0028)
- Tests first.
  - `SummaryOptions` (presentational): two small selects, "Prompt profile" and "Model", listing profile names and model display names; showing the chosen values; choosing one calls `onProfileChange` / `onModelChange` with the id; disabled while `isLoading`, showing the default label (e.g. the default profile's name) so nothing looks empty; a chosen model missing from the list still shown by id.
  - `SubmitForm`: with `options` the two selects render between the URL field and the button, and the form still submits the URL as before; without `options` the form is exactly as in 0.3.1 (existing tests unchanged).
  - `HomePage` (hooks mocked): selects start on the settings defaults; submitting untouched calls `createJob( url )` with no second argument; changing only the model calls `createJob( url, { model } )`; changing both sends both; choosing the default value again sends nothing for it; while settings, profiles or models are loading the form still submits and sends no options.
- Green: `components/SummaryOptions/`, optional `options` on `SubmitForm`, `HomePage` holds `profileId` / `model` overrides (`null` = default) and builds the options from `useSettings`, `useModels`, `usePromptProfiles`.

### 7.2 `SummaryInfo` on the review screen (ADR 0029)
- Tests first.
  - `formatSummaryInfo` (pure, TRD §7.5): `"<model> · <profile> v<n> · 31.2k in / 1.4k out · ~US$0.12"`; tokens as thousands with one decimal; cost two decimals, three under US$0.01; `null` cost drops the cost part; `null` tokens drop the token part; more than one attempt adds `"3 attempts, ~US$0.31 total"` (total omitted when null); a failed last run is labelled "Last attempt failed"; model name falls back to the id.
  - `SummaryInfo`: renders that line from `summary_usage` (`useModels` mocked), uses the display name when known; renders nothing when usage is null.
  - `ReviewScreen`: shows the info line under the note when the job has usage, nothing when not.
- Green: `formatSummaryInfo.ts`, `SummaryInfo`, mounted in `ReviewScreen` (also on the failed-summary screen, where the billed tokens of the failed attempt are useful).

### 7.3 Regenerate summary (ADR 0029)
- Tests first.
  - `useAutosaveDraft.cancelPending()` as above (timer cleared, no unmount flush, status `saved`, a later edit schedules a save again).
  - `ReviewActions`: **Regenerate summary** (outlined) appears when the summary hasn't failed and calls `onRegenerate`; not shown after a failure (Retry stays); disabled while regenerating. Existing ReviewActions tests unchanged.
  - `RegenerateDialog` (hooks mocked): starts on the job's profile (if still active, else the default) and model (else the default); says in text that the current note and any edits will be replaced; **Regenerate** submits only the values that differ from the starting ones (`{}` when unchanged); Cancel closes without calling; shows the server error and stays open; disabled while submitting.
  - `ReviewScreen`: the button opens the dialog; confirming cancels the pending autosave and calls the regenerate mutation; success puts the summarizing job in the cache (via `useRegenerateSummary`).
  - `JobPage`: with a job in review, regenerating moves to the progress view (cache gets `summarizing`), and when the new summary completes the review screen is back with the new note; no `updateDraft` is sent after confirming.
- Green: `cancelPending` in `useAutosaveDraft`, `ReviewActions` button, `components/RegenerateDialog/`, wiring in `ReviewScreen`.

## Phase 8 — Clean-up and verification

### 8.1 Docs
- `apps/web/CLAUDE.md`: routes (`/settings`), Settings components and the new job components in the folder structure, the drawer footer (Settings utility item), the ADR list (adds 0027–0029). README: Settings page, profiles and history, model choice, the cost line, regenerate, and the architecture sentence about summaries. (Server docs were done in 5.4.) Docs only, no tests.

### 8.2 Version 0.4.0
- `version` in root, `apps/server`, `apps/web` and `packages/shared` `package.json` and the README status line ("Version 0.4.0."). Check first with a grep that no test reads the version. `pnpm install` is not needed (no dependency change); run tests/lint/typecheck in all three packages after.

### 8.3 Final checks (reported, not ticked until Naresh confirms; status 🟨)
- `pnpm test`, `pnpm lint`, `pnpm typecheck` in shared, server and web; `pnpm build` in shared, server and web.
- Migration against a copy of the real 0.3.1 database: `docker cp mnemosyne-mnemosyne-1:/data` → scratchpad; a small script (scratchpad, uses the server's `openDatabase`) opens the copy; verify `user_version` 4, job rows and notes byte-identical to the copy before migrating, three seeded profiles, default profile set, summary tables empty; then start the server on the copy and `GET /api/jobs`, `/api/settings`.
- Browser checks (Chrome over DevTools protocol, light and dark, wide and narrow): Settings page (selects, profile editing, history, locked instructions), drawer footer collapsed and expanded, submit form with options, review screen with the info line and the regenerate dialog (job inserted into a temp database).
- The real check with Naresh is listed in the report as outstanding.
- Log line records results; the `tasks.md` row goes to 🟨, and I commit `docs(8.3): …`.

### 8.4 Release notes
- `docs/v0.4.0/release-notes.md`: new (profiles, editable prompt with history, model choice, regenerate, cost), changed (default summary prompt now Business ideas, `queueJob` options, migration 4), upgrade steps (back up the `mnemosyne_mnemosyne-data` volume's `mnemosyne.db` first, rebuild the image, restart), known issues (Haiku 5.5 unpriced, estimates drift from the bill, browser-storage-only drawer state, no Settings navigation blocker), ADRs 0027–0029. Linked from `docs/README.md`.

## Critical files
- New: `src/components/{SummaryOptions,SummaryInfo,RegenerateDialog}/` (+ tests), `src/components/SummaryInfo/formatSummaryInfo.ts` (+ test), `docs/v0.4.0/release-notes.md`.
- Edit: `src/components/{SubmitForm,HomePage,ReviewScreen,ReviewActions}/*`, `src/hooks/useAutosaveDraft.ts` (+ test), `apps/web/CLAUDE.md`, `README.md`, four `package.json`, `docs/README.md`, `docs/v0.4.0/tasks.md`.
- Reuse: `useSettings`, `useModels`, `usePromptProfiles`, `useRegenerateSummary` (checkpoint C), `mutationStub` and `summarizer.fixture.ts` in `test-support/`, `jobFixture`, the `ConfirmDialog`-style MUI dialog pattern and `BUTTON_SX` (disabled-button pointer rule) already in `ReviewActions`.

## Verification
Per task as above. End of checkpoint: everything in 8.3, then the report with: tasks and commit hashes, test/lint/typecheck results per package, ADRs (none new; none change the TRD), existing-test edits (the `HomePage` hook mocks), the migration result on the real-database copy, browser screenshots findings, deferred items (the real check with Naresh) and follow-ups.

## Open points for approval
1. `SubmitForm` takes one optional `options` object rather than several required props.
2. `HomePage.test.tsx` gets `vi.mock` lines for the new hooks (setup only).
3. 8.3 uses `docker cp` to copy (read-only) the real database out of the running container, and drives headless Chrome through a scratchpad DevTools script; both leave the repo and the container untouched.
