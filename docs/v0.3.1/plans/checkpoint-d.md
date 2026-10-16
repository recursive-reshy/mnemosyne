# Plan — Checkpoint D (Phase 6: clean-up and verification), tasks 6.1–6.3

## Context
Checkpoints A–C moved every screen outside the note editor onto MUI. What's left: delete `global.css` (the last global stylesheet), keep the note editor's CSS module working, update the docs and version, and verify the whole release. Web only; `NoteEditor.tsx`, `ModeToggle.tsx`, `NoteEditor.module.css` and the MDXEditor stylesheet are left exactly as they are (TRD §6.6).

Per task: failing test first → green → refactor → tick + log line → commit → push; then `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`. **6.3 is not ticked until Naresh confirms** (tasks.md).

## 6.1 Delete `global.css`, add the editor token shim
- `NoteEditor.module.css` is the only remaining user of `global.css` variables: `--color-border`, `--space-1`, `--space-2`. Nothing else references any `var( --…)` token (checked by grep).
- New `src/editorTokens.ts`: `editorTokens( theme )` returns the `GlobalStyles` block `{ ':root': { '--color-border': theme.vars.palette.divider, '--space-1': theme.spacing( 0.5 ), '--space-2': theme.spacing( 1 ) } }`, with a comment that it is removed in v0.3.2 when the editor is replaced or restyled. `main.tsx` renders `<GlobalStyles styles={ editorTokens } />` inside `ThemeProvider` and drops `import './global.css'`. This is a one-use module, which `apps/web/CLAUDE.md` discourages, but it exists to make the shim testable (a block inline in `main.tsx` cannot be unit-tested because `main.tsx` calls `createRoot`); TRD §6.6 only says "a `GlobalStyles` block in `main.tsx`", so the block is still used there. Mapped values equal the old ones (0.25rem → 4px, 0.5rem → 8px), so the editor's spacing stays identical.
- Test first (`editorTokens.test.ts`, red because the module is missing): the result defines exactly those three custom properties on `:root`, the border points at the theme's divider variable (`theme.vars.palette.divider`, which contains `var(`), and the two spacings are 4px and 8px. Then a render check with the theme: mounting `GlobalStyles` with it and reading `getComputedStyle( document.documentElement ).getPropertyValue( '--space-2' )` in jsdom; if jsdom doesn't surface Emotion's global custom properties, that second check is dropped and the browser check below covers it.
- Delete `src/global.css`. Existing tests unchanged and green (none import it); `NoteEditor` files untouched.
- Browser check (light and dark, the review screen): the editor's border and toolbar spacing match checkpoint C.
- Commit `feat(6.1): remove global.css, keep editor tokens`.

## 6.2 Docs and version
- `apps/web/CLAUDE.md` (the checkpoint-A edit already covered Stack, ADR list and the router exception):
  - Folder structure: `main.tsx` mounts the theme, `CssBaseline`, query client and router; drop the `global.css` line; add `theme.ts` and `editorTokens.ts`; the `components/` line becomes `<Name>/index.ts, <Name>.tsx, <Name>.test.tsx` (no `.module.css`, except `NoteEditor`'s own until v0.3.2), and `App.tsx` is "the routes inside `AppShell`".
  - Stack line: drop "Screens not yet converted still use plain CSS modules".
  - Files and naming: remove `SubmitForm.module.css` from the example folder.
  - JSX and CSS section: replaces "styles live in `<Name>.module.css`" with the new rule: style with MUI props and `sx`; `sx` objects longer than a few lines go in a module-level `const`; repeated styling goes in theme `components` overrides in `theme.ts`; spacing uses the theme scale; no new `.css` files or CSS modules (only `NoteEditor`'s remains, until v0.3.2); import MUI by path (`@mui/material/Button`).
  - Tests section: add what we learned: use `renderWithClient` (wraps the theme), `mockMatchMedia` from `test-support/matchMedia.ts` for narrow windows and OS colour scheme, MUI `Alert` has `role="alert"` on its root, and a disabled MUI `Button` needs `pointerEvents: 'auto'` where a test clicks it.
- `README.md`: in "Using it" add a short UI paragraph (navigation drawer: collapses to icons, remembered per browser, overlay on narrow windows; Light / Dark / System colour mode, System by default, remembered; the note editor itself stays light until 0.3.2) and update "Status and roadmap" to Version 0.3.1 (it reads 0.3.0). I notice the README still says the page address carries `?job=<id>`, which hasn't been true since routing (v0.2.x); I leave it alone and mention it in the report.
- `apps/web/package.json` version → 0.3.1 only (as the task says; the other packages and the root stay at 0.3.0 because nothing in them changed).
- Docs-only task: no new tests; `pnpm test`/`lint`/`typecheck` still run.
- Commit `docs(6.2): web docs, README and version 0.3.1`.

## 6.3 Final checks (report, do not tick until Naresh confirms)
Automated, run and reported:
- `rg -n "\.css['\"]" apps/web/src` → only `NoteEditor.module.css` and `@mdxeditor/editor/style.css`; `find apps/web/src -name "*.css"` → only `NoteEditor.module.css`.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` in `apps/web`; server and shared tests (`pnpm test` at the root) to confirm nothing outside the web app moved.
- `git diff --stat 93d9f43..HEAD -- apps/server packages/shared` is empty (web-only, behaviour-neutral).

Browser run, scripted with a throwaway `playwright-core` in the scratchpad: submit → progress → review → change folder (keyboard on the tree) → edit properties → autosave → save, and a second run for discard, in light, dark and system modes, wide and narrow, plus reload checks (drawer state and colour mode survive).
- **How:** against a small in-memory fake of the `/api` routes (Playwright route handlers), not the real server. A real run would start Whisper and the Claude API (cost and time), write a real note into Naresh's vault and delete real data, so I won't do it without a go-ahead. The fake walks a job through the real status sequence, serves a transcript, folders and drafts, and records the PATCH/save/delete calls so I can assert them. It exercises the real front end end to end; it does not exercise the server.
- Screenshots of each stage in light and dark (wide), plus narrow ones for the shell, the review screen and the open picker.
- **Naresh's own confirmation** (the real-server pass): list in the report the short manual run I'd ask him to do (submit a real short video, review, change folder with the keyboard, edit tags, save, discard another), then stop. 6.3 stays ⬜ until he says it's confirmed; then ticking it, the log line and the final commit are a separate step.
- Commit `docs(6.3): log the scripted verification` (log line only; Status stays ⬜).

## Critical files
Edit: `apps/web/src/main.tsx`, `apps/web/CLAUDE.md`, `README.md`, `apps/web/package.json`, `docs/v0.3.1/tasks.md`.
New: `apps/web/src/editorTokens.ts` (+ test).
Delete: `apps/web/src/global.css`.
Untouched: `NoteEditor/*`, server, shared.
Reuse: `theme.ts`, `renderWithClient`, `mockMatchMedia`.

## Report at the end
What was built per task with hashes; test/lint/typecheck/build per folder; the CSS grep and server/shared diff results; screenshots; ADRs written (none expected, none change the TRD); the small `editorTokens.ts` deviation; items deferred (editor dark mode and timestamp/caret sync to v0.3.2, the README `?job=` line).

## Risks
- jsdom may not expose Emotion's global custom properties; the render assertion would then be dropped in favour of the unit assertion plus the browser check.
- The fake API must match the shared Zod schemas the web app parses (job, transcript, folders, draft responses); I take the shapes from `packages/shared` and the existing test fixtures.
