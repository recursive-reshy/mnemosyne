# Mnemosyne v0.3.1 — Technical Requirements

Companion to `docs/v0.3.1/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.3.0 code at commit `93d9f43`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet.

## 1. Changes at a glance
- **Web only.** `apps/server`, `packages/shared`, the API and the database are not touched. A task that needs to change them is out of scope: stop and ask.
- MUI replaces `global.css` and all 15 CSS modules (`NoteEditor.module.css` last, in phase 7).
- A new app shell (top bar, mini-variant navigation drawer, colour-mode control) replaces the page chrome in `App.tsx`.
- `FolderPicker` moves to MUI X `SimpleTreeView`.
- `NoteEditor` is left alone until phase 7, which adds MDXEditor's formatting toolbar, its dark theme and an MUI wrapper, and removes `NoteEditor.module.css` and the `editorTokens` shim (§6.6). It stays on MDXEditor and the ADR 0023 contract.

## 2. Packages
| Package | Where | Why |
|---|---|---|
| `@mui/material` | web | Components and theming (ADR 0024) |
| `@emotion/react`, `@emotion/styled` | web | MUI's styling engine (peer dependencies) |
| `@mui/icons-material` | web | Icons for the shell and buttons |
| `@mui/x-tree-view` | web | `SimpleTreeView` / `TreeItem` for the folder picker (free tier, MIT) |

- Install the latest stable versions when work starts. Before planning, check with Context7: React 19 support, the current `createTheme` options for `cssVariables` and `colorSchemes`, `useColorScheme`, whether a Vite SPA needs `InitColorSchemeScript` to avoid a flash on load, and the `SimpleTreeView` props for controlled selection and expansion.
- No other dependencies. In particular, no `@mui/lab`, no Pigment CSS and no MUI X Pro packages.

## 3. Theme (`src/theme.ts`, new)
- `createTheme( { cssVariables: { colorSchemeSelector: 'class' }, colorSchemes: { light: { … }, dark: { … } }, … } )`. If Context7 shows `'data'` is the better selector for this setup, the plan may pick it.
- Seed the palettes from the current `global.css` tokens so the app keeps its colours: `primary.main` (light `#1d4ed8`, dark `#7ea6ff`), `error.main`, `success.main`, `background.default` / `paper`, `text.primary` / `secondary`, `divider`.
- `shape.borderRadius: 8` (the current `--radius`). Typography keeps the system font stack from `global.css`.
- Repeated styling goes in theme `components` overrides (for example `MuiButton` `defaultProps`, `MuiTextField` `size`). One-off layout goes in `sx`. No `styled()` components unless a style is used in more than one file.
- Spacing uses the theme scale (`sx={ { p: 2 } }`), not hard-coded rem values.

## 4. Providers (`src/main.tsx`)
- Order: `ThemeProvider theme={ theme }` → `CssBaseline` → `QueryClientProvider` → `BrowserRouter` → `App`. `ThemeProvider` gets `defaultMode="system"`; MUI stores the mode in localStorage under its default key.
- Remove the `./global.css` import. `CssBaseline` (with `enableColorScheme`) takes over `box-sizing`, body margin, background and text colour.
- If Context7 says the SPA needs it, add `InitColorSchemeScript` (or the documented equivalent) so the stored mode is applied before React renders.

## 5. App shell

### 5.1 Components (new)
| Component | Job |
|---|---|
| `AppShell` | Layout: `AppBar` + `NavDrawer` + main content (`children`). Owns the narrow-window breakpoint (`useMediaQuery( theme.breakpoints.down( 'md' ) )`) |
| `NavDrawer` | Mini-variant permanent drawer on wide windows, temporary drawer on narrow ones. Lists nav items; `ColorModeControl` pinned at the bottom |
| `ColorModeControl` | Expanded: a `ToggleButtonGroup` (Light / Dark / System) with an accessible group label. Collapsed: an `IconButton` (with tooltip) opening a `Menu` with the same three choices. Uses `useColorScheme()` |

- `App.tsx` keeps the routes and `useRemoveLegacyDrafts()`, wrapped in `<AppShell>`. The `h1` "Mnemosyne" moves into the `AppBar` and stays an `h1`, so `App.test.tsx` passes unchanged.
- The content area keeps the current max width (64rem) and the card look (`Paper` with `variant="outlined"`).
- Nav items are a module-level `as const` list (`{ label: 'Transcriber', to: '/', icon: … }`). The Transcriber item is current on `/` and `/jobs/*`.
- The hamburger is an `IconButton` with `aria-label="Open navigation"` / `"Close navigation"` and `aria-expanded`, and `aria-controls` pointing at the drawer.
- While `useColorScheme()` returns no `mode` (before it resolves), the control renders disabled rather than guessing.

### 5.2 Drawer state (`hooks/useNavDrawer.ts`, new)
- `useNavDrawer(): { isExpanded: boolean, toggle: () => void }`. Default `true`. Persisted to localStorage key `mnemosyne:nav-drawer` as `'expanded' | 'collapsed'`, read once on mount and written on toggle, every access inside try/catch (the `apps/web/CLAUDE.md` storage rule). An unknown stored value falls back to the default.
- The narrow-window overlay's open/closed state is plain component state in `AppShell` and is not persisted.

### 5.3 Router use
`NavDrawer` renders items as `ListItemButton component={ NavLink }` and reads the current location to mark the active item. This is a deliberate exception to the "only route components touch the router" rule. ADR 0025 records it, and `apps/web/CLAUDE.md` is updated to say navigation-shell components may use `NavLink` / `useLocation`.

## 6. Component migration rules

### 6.1 General
- Each component's `.module.css` is deleted in the same task that converts the component. Its styles move to `sx`, theme overrides or MUI props.
- Keep the existing accessible names, roles and labels. Prefer MUI props that keep the same DOM roles: `TextField` with `label` (it renders a real `<label>`), `Button`, `Link`, `List`, `Alert`.
- Plain `<a href>` downloads become `Button` / `Link` with `href` (still anchors).
- The status-label `as const` maps stay where they are.
- File size and style rules in `apps/web/CLAUDE.md` still apply. `sx` objects longer than a few lines go in a module-level `const` in the same file.

### 6.2 Alerts
The global `.alert` class is used in 10 places. Replace each one with `Alert` (`severity="error"` for errors), keeping the current role:
- `role="alert"` everywhere it is today (MUI's default for `Alert`).
- `PropertiesPanel`'s "front-matter invalid" stays `role="status"`: pass `role="status"` and use `severity="warning"`.
- `SubmitForm`'s message keeps its `id` (it is referenced by `aria-describedby`).
- `ModeToggle`'s alert is inside `NoteEditor`, so it waits for phase 7 (§6.6).

### 6.3 Progress and status
`JobProgress` keeps its `role="status"` element and text. Its stage list and progress indicator may use `Stepper` or `LinearProgress`, but the announced text must not change.

### 6.4 Tags
`TagInput` keeps its behaviour (Enter or comma adds, `mnemosyne` fixed and not removable). Render tags as `Chip`s, with `onDelete` on every tag except `mnemosyne`, next to a `TextField`. Don't switch to `Autocomplete` (`freeSolo`) unless the existing tests pass unchanged with it.

### 6.5 Folder picker (`SimpleTreeView`)
- `FolderTree` becomes `TreeItem`s inside a `SimpleTreeView` with `itemId` = folder path. "Vault root" is the first top-level item, with `itemId` `''` mapped to a sentinel if the component rejects an empty id.
- Selection is controlled: `selectedItems` = `chosenPath`; `onSelectedItemsChange` calls the existing `handleSelect`. Expansion is controlled: the branch to the chosen folder is expanded on open, and every match is expanded while a filter is active.
- `treeNodes.ts` (`filterTree`, `withExtraFolders`) and its tests are unchanged.
- Pending new folders show a small `Chip` "new" in the item label, replacing the "(new)" text badge.
- The disclosure ("Change folder", `aria-expanded`), filter box, new-folder form and validation message keep their current behaviour; use `Collapse` or plain conditional rendering for the panel.
- `FolderPicker.test.tsx` is rewritten for the tree roles (`tree`, `treeitem`, `aria-selected`, keyboard selection). Every behaviour the 0.3.0 tests check must still be checked. This is the one test file allowed to change beyond small fixes (ADR 0024).

### 6.6 Note editor
**Phases 1–6 (done):** `NoteEditor` was left as it was. `NoteEditor.module.css` kept working through the `editorTokens` shim (`src/editorTokens.ts`, rendered by `GlobalStyles` in `main.tsx`).

**Phase 7 (toolbar, dark mode, clean-up):** still MDXEditor (`@mdxeditor/editor`, no new dependency). Before planning, check its current API (Context7, or mdxeditor.dev if the quota is out): the toolbar components, `linkDialogPlugin`, the dark theme class names, how popups and dialogs pick up the theme, and the CSS variables it exposes for colours.

*Dark mode*
- `NoteEditor` reads the resolved scheme with MUI's `useColorScheme()` (`colorScheme`, treated as light while it is undefined) and adds MDXEditor's dark theme class (`dark-theme`, plus any companion class the docs name) to the editor when it is dark.
- The link dialog and dropdowns render in MDXEditor's popup container, outside the editor's DOM. They must get the dark theme too; if the class doesn't reach them, the plan says how (MDXEditor option first, a theme-level `GlobalStyles` rule second).
- Where MDXEditor's colours clash with the MUI palette (accent, background, borders), map its CSS variables to MUI's (`theme.vars.palette.*`) in the wrapper's `sx`. Keep this to a short, commented list.
- Switching colour mode while editing must not remount the editor: change the class only, so the text, selection and undo history survive.

*Toolbar*
- The toolbar (`toolbarPlugin`) holds the existing mode toggle and, in rich-text mode only (read `viewMode$`, as `ModeToggle` does), a `FormattingToolbar` (new, in the `NoteEditor` folder): `UndoRedo`, `Separator`, `BlockTypeSelect`, `BoldItalicUnderlineToggles` with only Bold and Italic, `ListsToggle` with only bullet and numbered, `CreateLink`.
- Plugin changes in `editorConfig.ts`: `headingsPlugin( { allowedHeadingLevels: [ 1, 2, 3 ] } )`, and `linkDialogPlugin()` added (it is part of `@mdxeditor/editor`). Nothing else changes in the plugin list or `noteMarkdownOptions`.
- Use MDXEditor's toolbar components as they come (they own focus handling and the active state); don't rebuild them in MUI. Check their accessible names and `aria-pressed` in the tests.

*Mode toggle and wrapper*
- `ModeToggle` becomes an MUI `ToggleButtonGroup` (exclusive, `size="small"`, buttons keep their labels and `aria-pressed`); the blocked message becomes `Alert severity="error"` (role `alert`).
- The `div` wrapper becomes `Paper variant="outlined"`. The content area's minimum height and padding move to the wrapper's `sx`, targeting a stable class passed as `contentEditableClassName` (for example `'noteEditorContent'`).
- Delete `NoteEditor.module.css`, `editorTokens.ts`, `editorTokens.test.tsx` and the `GlobalStyles` line in `main.tsx`.

*Round-trip*
- The ADR 0023 contract is unchanged and `noteRoundTrip.test.tsx` stays green unchanged. Add one fixture with everything the toolbar can produce (H1–H3, a quote, `**bold**`, `*italic*`, `-` and `1.` lists, a `[text](url)` link, nested inside a quote where MDXEditor allows it) and check that it is idempotent and comes out in the expected forms. If MDXEditor writes any of them differently (for example `_italic_`, `__bold__`, `*` bullets), stop and ask.

## 7. Removed
- `src/global.css`, `App.module.css`, and every `components/*/*.module.css` (`NoteEditor.module.css` in phase 7, with `editorTokens.ts` and its test).
- `apps/web/CLAUDE.md` updated: Stack (MUI instead of "plain CSS modules, no UI library"), folder structure (`theme.ts`, no `global.css`, component folders without a `.module.css`), the JSX/CSS style section (`sx`, theme overrides, no new CSS files), the router exception (§5.3), and the ADR list.

## 8. Tests
- **Regression net:** every existing web test passes unchanged, except `FolderPicker.test.tsx` (§6.5) and changes that only swap a query for an equivalent role query because MUI renders a different element. Each such change is listed in the task's log line. Server and shared tests aren't touched.
- **Test setup:** add a `window.matchMedia` stub to `test-support/setup.ts` (jsdom lacks it; `useMediaQuery` and the system colour scheme need it), defaulting to a wide window and light OS. Tests that need a narrow window or dark OS override it.
- **Test helper:** `renderWithClient` / `renderHookWithClient` wrap in the same `ThemeProvider` as `main.tsx`, so components render as they do in the app.
- **New tests:**
  - `useNavDrawer`: default expanded; toggle; persisted value read back; unknown value and throwing storage fall back to the default.
  - `AppShell` / `NavDrawer`: hamburger toggles `aria-expanded` and labels; collapsed items keep accessible names; Transcriber is current on `/` and `/jobs/:id`; narrow window shows the overlay, opens from the hamburger and closes on item click and Escape.
  - `ColorModeControl`: three choices, the current one selected, choosing one calls `setMode`; collapsed variant opens a menu with the same choices.
- **Checks per task:** `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`. After each screen phase, a browser check of that screen in light and dark mode (screenshots), as `apps/web/CLAUDE.md` requires.
- **Editor (phase 7):** `NoteEditor.test.tsx` and `noteRoundTrip.test.tsx` stay green; the only allowed changes are query swaps for the MUI toggle, listed in the log. New tests: formatting buttons present with accessible names in rich mode and absent in source mode; Bold, Italic and the block type reflect the current selection where jsdom allows it, otherwise this moves to the browser check; the toolbar fixture round-trips (§6.6); the dark class is set when `colorScheme` is dark and removed when light, without remounting (the editor keeps its text); `ModeToggle` blocked state still shows the alert.
- **Editor browser check:** in light and dark mode, use every toolbar button on a real note, then open source mode and check the Markdown; open the block-type dropdown and the link dialog in dark mode and read them; switch colour mode mid-edit and keep typing.
- **Final check (phase 6):** `rg -n "\.css['\"]" apps/web/src` finds only `NoteEditor.module.css` and `@mdxeditor/editor/style.css`; no `.css` file exists in `apps/web/src` except `NoteEditor.module.css`; `pnpm build` passes; a full browser run (submit → progress → review → change folder → edit properties → autosave → save, and discard) in light, dark and system modes, wide and narrow.

## 9. Phases (detail in `tasks.md`)
1. **Foundation:** docs and ADRs; dependencies; theme and providers; test setup; app shell, drawer, colour mode.
2. **Home:** `HomePage`, `SubmitForm`, `JobList`.
3. **Job:** `JobPage`, `JobProgress`, `DownloadLinks`.
4. **Review, part 1:** `ReviewScreen`, `TranscriptPane`, `ReviewActions`, `NoteDestination`, `FilenamePreview`.
5. **Review, part 2:** `PropertiesPanel`, `TagInput`, `FolderPicker` on `SimpleTreeView`.
6. **Clean-up and verification:** `global.css` removed (editor token shim added), CLAUDE.md and README, version bump, final checks.
7. **Editor:** dark mode, MUI mode toggle and wrapper, formatting toolbar, `NoteEditor.module.css` and the shim removed, docs, final checks. After it, the only stylesheet import is `@mdxeditor/editor/style.css` and no `.css` file exists in `apps/web/src`.

Suggested checkpoints: **A** = phase 1, **B** = phases 2–3, **C** = phases 4–5, **D** = phase 6, **E** = phase 7.

Every task leaves the app working. Until phase 6, `global.css` stays, so unconverted screens keep their look next to converted ones. In that window, an unconverted screen follows the OS colour scheme rather than the toggle (its tokens use `prefers-color-scheme`). That is accepted, and it ends when phase 5 is done.

## 10. ADRs (new, drafted with this TRD)
- 0024 Material UI as the single UI library (partly supersedes 0011)
- 0025 App shell: navigation drawer and colour mode

## 11. Open questions
None.
