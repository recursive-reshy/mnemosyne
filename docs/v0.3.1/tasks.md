# Tasks — Mnemosyne v0.3.1

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or two phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results, browser screenshots (light and dark) of the screens touched, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR and add its number to the task's ADR column.
- **This version is web-only and behaviour-neutral.** Any change to `apps/server` or `packages/shared`, or to what a screen does, is out of scope: stop and ask.
- A converted component's existing tests must pass unchanged, except `FolderPicker.test.tsx` (TRD §6.5) and query swaps listed in the log line (TRD §8).
- Every task must leave the whole app working: `global.css` stays until 6.1.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phase 1 (foundation)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Foundation** | | |
| 1.1 | `docs/README.md`: v0.3.1 is current (v0.3.0 marked done); add ADRs 0024 and 0025 to the index as Accepted (and set their Status lines); mark 0011 "Partly superseded by 0013, 0024" in the index and in its file. | 0024, 0025 | ✅ |
| 1.2 | Add `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, `@mui/x-tree-view` (check APIs and React 19 support with Context7 first). `test-support/setup.ts` gets a `matchMedia` stub (wide window, light OS by default, overridable) | 0024 | ✅ |
| 1.3 | `theme.ts`: CSS variables, light and dark schemes seeded from `global.css`, radius and font; `main.tsx` wraps the app in `ThemeProvider` (`defaultMode="system"`) and `CssBaseline`, plus `InitColorSchemeScript` if Context7 says it's needed. `renderWithClient` / `renderHookWithClient` wrap in the same theme. Every existing test stays green | 0024 | ✅ |
| 1.4 | `useNavDrawer`: default expanded, toggle, persisted to `mnemosyne:nav-drawer` inside try/catch, bad values and blocked storage fall back to the default | 0025 | ✅ |
| 1.5 | `ColorModeControl`: Light / Dark / System `ToggleButtonGroup` when expanded, icon button + menu when collapsed, on `useColorScheme()`; disabled until the mode resolves | 0025 | ✅ |
| 1.6 | `AppShell` + `NavDrawer`: top bar (hamburger with `aria-expanded` / `aria-controls`, `h1` "Mnemosyne"), mini-variant permanent drawer on wide windows, temporary drawer on narrow ones, Transcriber item (`NavLink`, current on `/` and `/jobs/*`), colour mode at the bottom. `App.tsx` renders the routes inside `AppShell`; `App.module.css` deleted; `App.test.tsx` unchanged and green. Update `apps/web/CLAUDE.md` (Stack, router exception for the shell, ADR list) | 0024, 0025 | ✅ |

## Checkpoint B: Phases 2–3 (home and job screens)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 2** | **Home** | | |
| 2.1 | `SubmitForm` on MUI (`TextField` with label, `Button`, `Alert` keeping its `id` and `role="alert"`); `SubmitForm.module.css` deleted | 0024 | ✅ |
| 2.2 | `JobList` on MUI (`List` / `ListItemButton` or `Table`, status and expiry text unchanged); `JobList.module.css` deleted | 0024 | ✅ |
| 2.3 | `HomePage` layout on MUI (`Stack`, `Typography`); `HomePage.module.css` deleted | 0024 | ✅ |
| **Phase 3** | **Job** | | |
| 3.1 | `JobProgress` on MUI (`role="status"` text unchanged; `Stepper` or `LinearProgress` for stages; `Alert` for failures and connection errors); `JobProgress.module.css` deleted | 0024 | ✅ |
| 3.2 | `DownloadLinks` as MUI `Button`s with `href` (still anchors to `/api/jobs/:id/download?format=…`); `DownloadLinks.module.css` deleted | 0024 | ✅ |
| 3.3 | `JobPage` alerts on MUI `Alert` | 0024 | ✅ |

## Checkpoint C: Phases 4–5 (review screen)
**Plan:** ✅ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Review, part 1** | | |
| 4.1 | `ReviewScreen` layout on MUI (`Grid` or `Stack`, transcript beside the note on wide windows, stacked on narrow ones; save-status line keeps `role="status"`); `ReviewScreen.module.css` deleted. `NoteEditor` is not touched | 0024 | ⬜ |
| 4.2 | `TranscriptPane` on MUI (`Paper`, scrollable, `Alert` for errors); caret-sync scrolling unchanged; `TranscriptPane.module.css` deleted | 0024 | ⬜ |
| 4.3 | `ReviewActions` (`Button`s: Save to vault, Discard, Retry summary as today), `NoteDestination` (`Alert`), `FilenamePreview` (`Typography` + `code`); their `.module.css` files deleted | 0024 | ⬜ |
| **Phase 5** | **Review, part 2** | | |
| 5.1 | `TagInput` with `Chip`s (`onDelete` on all but `mnemosyne`) and a `TextField`; `TagInput.module.css` deleted | 0024 | ⬜ |
| 5.2 | `PropertiesPanel` on MUI (`TextField` for title, read-only fields, `Alert severity="warning" role="status"` for "front-matter invalid"); `PropertiesPanel.module.css` deleted | 0024 | ⬜ |
| 5.3 | `FolderPicker` on `SimpleTreeView` (controlled selection and expansion, vault root first, "new" `Chip`, filter and new-folder form as today); `FolderTree` rewritten; `treeNodes.ts` unchanged; `FolderPicker.test.tsx` rewritten for tree roles, covering every 0.3.0 behaviour; `FolderPicker.module.css` deleted | 0024 | ⬜ |

## Checkpoint D: Phase 6 (clean-up and verification)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Clean-up and verification** | | |
| 6.1 | Delete `global.css` and its import; add the `GlobalStyles` shim for the three tokens `NoteEditor.module.css` uses (comment: removed in v0.3.2); `NoteEditor` files untouched and its tests green | 0024 | ⬜ |
| 6.2 | Docs: `apps/web/CLAUDE.md` (folder structure, JSX/CSS style section: `sx`, theme overrides, no new CSS files), README (UI section: drawer, colour mode), web `package.json` version 0.3.1 | 0024, 0025 | ⬜ |
| 6.3 | Final checks (report results, don't tick until Naresh confirms): only `NoteEditor.module.css` and the MDXEditor stylesheet remain as CSS; `pnpm build` passes; browser run of submit → progress → review → folder change (tree keyboard use) → properties → autosave → save, and discard, in light, dark and system modes, wide and narrow; drawer and mode survive a reload | — | ⬜ |

---

## Log

- 1.1: docs only. README current version 0.3.1, ADRs 0024 and 0025 indexed as Accepted, 0011 marked partly superseded by 0024. No code, so no tests.
- 1.2: added @mui/material 9.5.0, @emotion/react 11.14.0, @emotion/styled 11.14.1, @mui/icons-material 9.5.0, @mui/x-tree-view 9.15.0 (no peer warnings with React 19). Context7 quota was out, so API checks used mui.com. `test-support/matchMedia.ts` stub (wide + light by default, `setWide` / `setDark` fire change events) installed by `setup.ts`; web 335 tests, lint, typecheck green.
- 1.3: `theme.ts` (class-selector CSS variables, light/dark seeded from global.css, radius 8, system font; `CssThemeVariables` augmentation for types, with one eslint-disable for the namespace rule). `main.tsx` wraps in `ThemeProvider` (`defaultMode="system"`, `noSsr`, no `InitColorSchemeScript` for now; flash to be checked in 1.6) and `CssBaseline`. Both test helpers wrap in the same theme (inlined, not a shared component: a component in that file trips react-hooks/globals on `current`). No existing test changed; web 338 tests, lint, typecheck green.
- 1.4: `useNavDrawer` (default expanded, persisted to `mnemosyne:nav-drawer`, all storage access in try/catch); 6 new tests; web 344 tests, lint, typecheck green.
- 1.5: `ColorModeControl` (expanded toggle group, collapsed icon button + menu of `menuitemradio`s, disabled while `mode` is undefined). MUI stores the choice under `mui-mode`. Tests mock `useColorScheme` only for the unresolved-mode case; 8 new tests; web 352 tests, lint, typecheck green.
- 1.6: `AppShell` + `NavDrawer`; `App.tsx` renders routes inside the shell, `App.module.css` deleted, `App.test.tsx` unchanged and green. NavDrawer uses the router `Link` + `useLocation` with an explicit `aria-current`, not `NavLink`: NavLink marks `/` current only on exactly `/`, so it cannot express "current on `/jobs/*`" (same ADR 0025 exception, no TRD change). `apps/web/CLAUDE.md`: stack, router exception, ADR list. Colour-mode toggles tightened after a browser check showed them clipped in the 240px drawer. Browser-checked light, dark, system, collapsed, narrow overlay and reload persistence with a throwaway playwright-core. Web 372 tests, lint, typecheck, build green.
- 2.1: `SubmitForm` on MUI (`TextField`, `Button`, `Alert` keeping its `id`); `SubmitForm.module.css` deleted. Existing tests unchanged; one guard test added (a server error does not set `aria-invalid`), which passes before and after, so there was no red for this task. MUI disables pointer events on disabled buttons, which broke the unchanged "disables the form while submitting" click, so the submit button restores `pointer-events: auto` and `not-allowed` in its `sx` (as 0.3.0 behaved). A theme override did not help because that test renders without the theme. Web 373 tests, lint, typecheck green.
- 2.2: `JobList` on MUI (`List` / `ListItem`, router link through MUI `Link`, status and expiry as `Typography`); `JobList.module.css` deleted. `JobList.test.tsx` unchanged and green. Web 373 tests, lint, typecheck green.
- 2.3: `HomePage` layout on MUI (`Stack`; the saved line is an `Alert severity="success" role="status"`); `HomePage.module.css` deleted. `HomePage.test.tsx` unchanged and green. Browser-checked home in light, dark and narrow with a validation error: no clash with the remaining `global.css` base styles. Web 373 tests, lint, typecheck green.
- 3.1: `JobProgress` on MUI: `Stack` section, `Alert` for failures and connection errors, `Button` for retry, stages as `List component="ol"` of `ListItem`s with state icons (kept `aria-current`, `data-state`, labels). `Stepper` not used: it has no `listitem` roles, so the unchanged tests would not hold. `JobProgress.module.css` deleted; `JobProgress.test.tsx` unchanged and green. Web 373 tests, lint, typecheck green.
- 3.2: `DownloadLinks` as MUI `Button component="a"` with `href` and `download` (still anchors; Markdown contained, others outlined) in a `region` `Stack`; the `ul`/`li` wrapper is gone because the test only queries links in the region. `DownloadLinks.module.css` deleted; `DownloadLinks.test.tsx` unchanged and green (it renders without the theme). Web 373 tests, lint, typecheck green.
- 3.3: `JobPage` on MUI: `Alert` for the load error, retry error and saved line (`role="status"` kept), `Button`s, `Stack` layout; the loading line is `Typography role="status"`. Test swap (TRD §8): in `JobPage.test.tsx` "shows a failed retry and stays on the old job", `findByText(...)` + `role` attribute check became a check that one of the `alert` roles has the text, because MUI puts the text in an inner element of the `role="alert"` root, and the failed job also shows its own alert. Nothing else in that file changed. Browser-checked transcribing (light), failed and saved (dark) with a mocked job response. Web 373 tests, lint, typecheck, build green.
