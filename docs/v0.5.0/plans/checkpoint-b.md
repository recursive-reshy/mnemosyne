# Checkpoint B plan: Phase 5 (caret sync)

Next: **Checkpoint B, task 5.1** (Plan cell ⬜). Checkpoint A is done. On approval: save this to `docs/v0.5.0/plans/checkpoint-b.md`, tick the Plan cell, commit `docs(plan): checkpoint B`, push, then start 5.1.

Read: PRD §6.8, TRD §8.7, ADR 0033, `tasks.md`, the web code below.

## Context
Caret sync (clicking a timestamp or moving the caret onto a line with one scrolls and highlights the transcript) has passed its jsdom tests since 0.3.0 but fails in a real browser (PRD §6.8). Why the tests miss it: `ReviewScreen.test.tsx` replaces `NoteEditor` with a plain `<textarea name="Summary">` (`vi.mock( '../NoteEditor' )`), so the real path (`NoteEditor`'s `selectionchange` / `keyup` / `mouseup` listeners → `richBlockText` / `sourceLineText` in `components/NoteEditor/caretText.ts` → `ReviewScreen.handleCaretLine` → `parseTimestampSeconds` in `timestamp.ts` → `focusSecond` → `TranscriptPane` setting `scrollTop = element.offsetTop` and `aria-current`) has never run against MDXEditor's Lexical or CodeMirror in a real DOM. The fix starts with a test that fails in a real browser, then the cause.

Per `apps/web/CLAUDE.md` and ADR 0033, each task ends with `pnpm test`, `pnpm test:browser` (from 5.1 on), lint and typecheck in web; shared and server are untouched.

## 5.1 Browser-mode setup (TRD §8.7 step 1)
- **Tests first:** a trivial `src/browserSetup.browser.test.tsx` that renders a `<div>` with RTL-free DOM (or `vitest-browser`-free plain DOM) and asserts something only a real browser gives (`getComputedStyle` of a styled element, `document.getSelection()` on a range, `offsetHeight > 0`). Red: `pnpm test:browser` doesn't exist / the file is excluded. Green: after the config below, it passes in chromium and webkit.
- **Dependency:** `@vitest/browser-playwright`, pinned to the version current at add time. `npm view` shows 5.0.5 with peer `vitest: 5.0.5` exactly, while web has `vitest ^5.0.4`; I'll check which vitest the lockfile resolves and, if it's 5.0.4, bump `vitest` in web to match (same family, a dev dependency already named in the TRD; I'll say so in the log line). `playwright` comes in as its peer. If the peers can't be satisfied without a bigger bump, I stop and ask.
- **`apps/web/vite.config.ts`:** `test.projects` with two entries extending the root config:
  - `unit`: today's settings (jsdom, setup file), `include: src/**/*.test.{ts,tsx}`, `exclude: src/**/*.browser.test.tsx`.
  - `browser`: `include: src/**/*.browser.test.tsx`, `browser: { enabled: true, headless: true, provider: playwright(), instances: [ { browser: 'chromium' }, { browser: 'webkit' } ] }`. Setup file: a small `src/test-support/browser.setup.ts` for the jest-dom matchers only (not the jsdom stubs).
  - I'll verify the real option names against the installed package before writing (the TRD says to check each dependency's real API).
- **Scripts:** `test` stays jsdom only (`vitest run --project unit`); new `test:browser` (`vitest run --project browser`).
- **Browsers:** Chromium is already cached on this Mac; WebKit isn't. `pnpm --filter web exec playwright install chromium webkit` downloads from the network, so I'll ask you before running it (or you run it).
- **Docs:** README Setup gets the one line `pnpm --filter web exec playwright install chromium webkit` (development only). Lint: make sure `*.browser.test.tsx` files are covered by the existing ESLint config and `tsconfig.app.json` (it includes all of `src`; add `@vitest/browser/providers/playwright` types if the typecheck needs them).
- **Gate:** web `test`, `test:browser` (both browsers), lint, typecheck, build. Commit `feat(5.1): browser-mode tests`.

## 5.2 Reproduce the failure (TRD §8.7 step 2)
- **File:** `src/components/ReviewScreen/ReviewScreen.browser.test.tsx`. It renders the real `ReviewScreen` with the real `NoteEditor` (MDXEditor) inside the MUI theme and a query client (reuse `renderWithClient` if it works in the browser project; otherwise render with the same providers by hand). Only the `api/` modules are mocked (`vi.mock( '#src/api/jobs.api' )` etc., as in the jsdom test), so `useSource` returns a video with a long transcript (enough paragraphs that the pane scrolls: ~40 paragraphs with `groupParagraphs`-sized gaps) and the job has a note with `[02:15](…?t=135)` in a bullet, a plain line and a second timestamp far down.
- **Rich mode:** click inside the bullet that holds the timestamp (`userEvent` from `vitest/browser`), assert `#transcript-135` has `aria-current="true"` and the pane's `scrollTop` is greater than 0 and the paragraph is inside the pane's visible area. Then click a plain line and assert the marker stays.
- **Source mode:** click the "Source mode" toggle, focus the CodeMirror editor, move the cursor onto the timestamp line with the arrow keys, assert the same.
- **Commit failing:** each test is `it.fails( … )` so the suite is green. The log line says exactly how each fails in each browser (no `aria-current`, no scroll, which listener never fires). To get that, while diagnosing I'll temporarily add `console.log` in a scratch copy of the listeners and remove it before committing.
- **Gate:** `test`, `test:browser` (green because of `it.fails`), lint, typecheck. Commit `test(5.2): caret sync reproduction`.

## 5.3 Fix and ADR (TRD §8.7 steps 3–4)
- **Find the actual cause** by checking, in order, with the browser tests: (1) `selectionchange` reaches `report` and `richBlockText` returns the block text (Lexical may keep the selection in a shadow-like internal state, or `anchorNode` may be the editable root so `closest( RICH_BLOCKS )` fails); (2) the text of the block matches `parseTimestampSeconds` (a link renders `02:15` inside an `<a>`; the stamp regexp and the surrounding text); (3) `focusSecond` reaches `TranscriptPane` and `activeStart` resolves; (4) the scroll: `paneRef.scrollTop = element.offsetTop` is wrong if the pane is not the paragraph's `offsetParent` (the `Paper` has `position: relative` but `maxHeight` and `overflowY` may be overridden by the layout, so the real scroller could be an ancestor). The plan doesn't assume which; the reproduction decides.
- **Fix:** the smallest change in the failing link of that chain, with the browser tests as the guard (remove `it.fails`; both modes pass in chromium and webkit). If the fix needs a new jsdom-visible unit (e.g. `richBlockText` for an anchor on the editable root), add that test first. Existing jsdom caret tests in `ReviewScreen.test.tsx`, `NoteEditor.test.tsx` and `timestamp.test.ts` must pass unchanged.
- **If the cause isn't covered by the PRD/TRD/ADRs** (e.g. it needs a new dependency or an editor plugin), stop and ask.
- **ADR 0034** (next number) records the cause and the fix; add it to `docs/README.md` and to the 5.3 ADR column. Check whether it changes the TRD (expected: no).
- **Docs:** `apps/web/CLAUDE.md`: the Commands list gets `pnpm test:browser`, the Tests section says browser tests are for real-DOM behaviour only and that the gate for every web task includes `test:browser` from now on, the stack line mentions Vitest browser mode with Playwright, and the ADR list adds 0033 and 0034.
- **Gate:** web `test`, `test:browser`, lint, typecheck, build. Commit `fix(5.3): caret sync in a real browser`.

## Checkpoint report
Commit hashes per task; how the reproduction failed in each browser; the cause; results for web `test`, `test:browser` (chromium and webkit), lint, typecheck, build (shared and server not touched); screenshots of the review screen in light and dark with the transcript scrolled (headless Chrome run as in 0.4.0's browser check, and a Safari/WebKit screenshot from Playwright), ADR 0034 and whether it changes the TRD, anything deferred. The real check in Chrome and Safari on a real video stays with the final checkpoint (10.3).

## Risks and decisions to confirm
1. **Browser download:** installing WebKit needs the network. I'll ask before running it.
2. **Vitest version:** `@vitest/browser-playwright` pins `vitest` exactly; a patch bump of web's `vitest` may be needed.
3. **`vi.mock` in browser mode** works for the `api/` modules, but if it can't mock them cleanly I'll stub `fetch` instead (still no network, no new dependency).
