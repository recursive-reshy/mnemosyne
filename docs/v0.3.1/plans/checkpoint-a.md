# Plan — Checkpoint A (Phase 1: foundation), tasks 1.1–1.6

## Context
v0.3.1 moves `apps/web` from hand-written CSS to Material UI and adds an app shell (drawer + colour mode). Checkpoint A lays the foundation: docs, dependencies, theme and providers, test plumbing, then the shell. Web only; `global.css` stays until 6.1 so unconverted screens keep working. ADRs 0024 and 0025 are the governing decisions (both still "Proposed").

Research note: Context7's monthly quota is exhausted, so I checked the MUI docs directly (mui.com). Findings that shape the plan:
- `createTheme( { cssVariables: { colorSchemeSelector: 'class' }, colorSchemes: { light, dark } } )`; default mode is `system`; `ThemeProvider defaultMode="system"`.
- `useColorScheme().mode` is `undefined` on first render, hence the disabled control (TRD §5.1).
- For a client-only SPA the docs point to `noSsr` on `ThemeProvider` (not `InitColorSchemeScript`, which is for SSR) to avoid a flash. Plan: use `noSsr`; check for a flash in the browser at 1.6, and only if one shows add `InitColorSchemeScript` in `index.html`.
- `SimpleTreeView` controlled selection is `selectedItems` / `onSelectedItemsChange` (used in checkpoint C, not here).
- Exact versions and React 19 peer ranges are confirmed by `pnpm add` output in 1.2 (peer warnings = stop and report).

Every task: failing test first → green → refactor → tick Status + log line in `tasks.md` → commit → push. After each: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`.

## 1.1 Docs: v0.3.1 current, ADRs accepted (no tests; docs only)
- `docs/README.md`: "current version is 0.3.1"; add a v0.3.1 line (PRD · TRD · Tasks · plans) and mark v0.3.0 "(done)"; add rows 0024 and 0025 as Accepted; 0011 status → "Partly superseded by 0013, 0024".
- `docs/decisions/0024-…md`, `0025-…md`: Status → Accepted.
- `docs/decisions/0011-web-stack.md`: Status line → "Accepted; partly superseded by 0013 (data fetching, routing) and 0024 (styling)".
- Commit `docs(1.1): v0.3.1 current, ADRs 0024 and 0025 accepted`.

## 1.2 Dependencies and matchMedia stub
- `pnpm --filter @mnemosyne/web add @mui/material @emotion/react @emotion/styled @mui/icons-material @mui/x-tree-view`. Nothing else.
- New `src/test-support/matchMedia.ts`: `mockMatchMedia( { isWide = true, isDark = false } )` installs a `window.matchMedia` that evaluates `(min-width…)`/`(max-width…)` breakpoint queries against `isWide` and `(prefers-color-scheme: dark)` against `isDark`, with `addEventListener`/`removeEventListener` and a way to fire a change (for the live OS-change test later). `setup.ts` calls it with defaults (wide, light) in a `beforeEach`.
- Test first: `matchMedia.test.ts` — default stub reports wide + light; `mockMatchMedia( { isWide: false } )` and `{ isDark: true }` override; change listeners fire. Red: module missing. Green: write it.
- Commit `feat(1.2): MUI dependencies and matchMedia test stub`.

## 1.3 Theme and providers
- New `src/theme.ts`: `createTheme` with `cssVariables: { colorSchemeSelector: 'class' }`, `colorSchemes` light/dark seeded from `global.css` (primary `#1d4ed8` / `#7ea6ff`, error, success, background default/paper, text primary/secondary, divider), `shape.borderRadius: 8`, system font stack.
- `main.tsx`: `ThemeProvider theme defaultMode="system" noSsr` → `CssBaseline enableColorScheme` → existing `QueryClientProvider` → `BrowserRouter` → `App`. Keep `import './global.css'` (removed in 6.1).
- `test-support/renderWithClient.tsx`: both helpers wrap in the same `ThemeProvider` (`noSsr`, `defaultMode="system"`), outside the query client.
- Test first: `theme.test.ts` — both schemes exist with the seeded primary colours, radius 8, `cssVariables` on. Red: file missing. Also confirm the whole existing suite is green with the new wrapper (regression net).
- Commit `feat(1.3): MUI theme and providers`.

## 1.4 `useNavDrawer` (ADR 0025)
- New `src/hooks/useNavDrawer.ts` → `{ isExpanded, toggle }`; key `mnemosyne:nav-drawer` = `'expanded' | 'collapsed'`; read once on mount (lazy `useState` initialiser), write on toggle; every storage access in try/catch, empty catch with the same comment style as `useRemoveLegacyDrafts.ts`.
- Tests first (`useNavDrawer.test.ts`, `renderHookWithClient`): default expanded; toggle flips and writes; stored `'collapsed'` read back; unknown stored value → expanded; `getItem` throwing → expanded; `setItem` throwing → toggle still works in state. Red: module missing.
- Commit `feat(1.4): useNavDrawer`.

## 1.5 `ColorModeControl`
- New `components/ColorModeControl/{ColorModeControl.tsx,index.ts,ColorModeControl.test.tsx}`; props `{ isCollapsed: boolean }`. Uses `useColorScheme()` (`mode`, `setMode`).
  - Expanded: `ToggleButtonGroup exclusive` with `aria-label="Colour mode"` and buttons Light / Dark / System (icons + labels); current one `aria-pressed`.
  - Collapsed: `IconButton` (tooltip + aria-label "Colour mode") opening a `Menu` with three `MenuItem`s, current one selected.
  - `mode` undefined → control disabled.
  - Choice labels in one `as const` map at module level. No new CSS files; `sx` only.
- Tests first: three choices present; current mode selected (stored mode seeded via the same localStorage key MUI uses, or by choosing and asserting); choosing one changes the selected state and writes the mode; collapsed variant opens a menu with the same three items; system option follows the stubbed OS scheme and reacts to a fired change. Red: component missing.
- Commit `feat(1.5): ColorModeControl`.

## 1.6 `AppShell` + `NavDrawer`
- New `components/AppShell/` (AppBar + drawer + `<main>` content, max width 64rem, `Paper variant="outlined"` card look, `children`) and `components/NavDrawer/` (nav items as a module-level `as const` list; `ListItemButton component={ NavLink }`, `useLocation` to mark Transcriber current on `/` and `/jobs/*` with `aria-current="page"`; mini-variant permanent `Drawer` on wide, temporary `Drawer` on narrow; collapsed items keep `aria-label` and show a `Tooltip`; `ColorModeControl` pinned at the bottom).
- `AppShell` owns `useMediaQuery( theme.breakpoints.down( 'md' ) )`, `useNavDrawer()` for the wide state and plain `useState` for the narrow overlay. Hamburger `IconButton`: `aria-label` "Open navigation"/"Close navigation", `aria-expanded`, `aria-controls` = drawer id. `h1` "Mnemosyne" in the `AppBar`.
- `App.tsx`: keep `useRemoveLegacyDrafts()` and the routes, wrapped in `<AppShell>`; delete `App.module.css`. `App.test.tsx` is not touched.
- Tests first (`AppShell.test.tsx`, `NavDrawer.test.tsx`): hamburger toggles `aria-expanded` and its label, and the state persists via `mnemosyne:nav-drawer`; collapsed items still have accessible names; Transcriber is current on `/` and `/jobs/:id`, not on an unrelated state; narrow (`mockMatchMedia( { isWide: false } )`): drawer closed by default, hamburger opens it, item click closes it and navigates, Escape closes it. Red: components missing; `App.test.tsx` stays green throughout.
- `apps/web/CLAUDE.md`: Stack line (MUI, `@mui/x-tree-view`, theme in `theme.ts`), router exception for shell components (`NavLink` / `useLocation`), ADR list adds 0024 and 0025. (Folder-structure and CSS style sections wait for 6.2, as `global.css` and module CSS still exist.)
- Browser check (dev server + server behind it): shell in light, dark and system, wide and narrow, drawer collapse and reload, and a look for a first-paint flash. Screenshots go in the checkpoint report.
- Commit `feat(1.6): app shell with navigation drawer`.

## Critical files
Edit: `docs/README.md`, `docs/decisions/0011…, 0024…, 0025…`, `apps/web/package.json` (+ lockfile), `src/main.tsx`, `src/App.tsx`, `src/test-support/{setup.ts,renderWithClient.tsx}`, `apps/web/CLAUDE.md`, `docs/v0.3.1/tasks.md`.
New: `src/theme.ts`, `src/test-support/matchMedia.ts`, `src/hooks/useNavDrawer.ts`, `src/components/{AppShell,NavDrawer,ColorModeControl}/`.
Delete: `src/App.module.css`.
Reuse: `useRemoveLegacyDrafts.ts` storage pattern, `renderWithClient` (`route`, `location()`), `jobFixture`.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web` all green; `App.test.tsx` unchanged.
- End: browser run as in 1.6; checkpoint report (tasks with hashes, results, screenshots light/dark, ADR notes — none expected to change the TRD, deferred items).

## Risks / things I'll flag
- Context7 quota out: docs were checked on mui.com instead; if a peer-dependency or API mismatch appears in 1.2/1.3 I stop and ask.
- Until 6.1, unconverted screens follow the OS scheme, not the toggle (accepted in TRD §9).
