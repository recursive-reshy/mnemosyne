# 0033. Browser-mode tests with Vitest and Playwright for real-DOM behaviour

- Status: Proposed
- Date: 2026-10-18

## Context
Timestamp caret sync on the review screen has passed its jsdom tests since 0.3.0 but doesn't work in a real browser. jsdom doesn't implement layout, scrolling, or the selection behaviour of MDXEditor's Lexical and CodeMirror editors faithfully, so tests of that behaviour can pass while the feature is broken.

## Decision
- **Add Vitest browser mode with the Playwright provider** (`@vitest/browser-playwright`, a web dev dependency) as a second Vitest project in `apps/web`, running Chromium and WebKit (Safari's engine) headless.
- Browser tests are named `*.browser.test.tsx` and run with `pnpm --filter web test:browser`. The jsdom project excludes them, and `test` stays jsdom only, so the fast suite is unchanged.
- Use browser tests only for behaviour that depends on a real DOM (selection, focus, scrolling, layout). Everything else stays in jsdom.
- From v0.5.0 checkpoint B on, `test:browser` is part of every web task's gate (`apps/web/CLAUDE.md`).
- The caret-sync fix starts with a browser test that reproduces the failure before any code changes. The cause and fix get their own ADR.
- Browsers are installed once on Naresh's Mac (`playwright install chromium webkit`); nothing changes in Docker.

## Consequences
- Bugs like the caret-sync one are caught by tests.
- Browser tests are slower and need the Playwright browsers installed locally.
- One test runner and one assertion style for both kinds of test.

## Alternatives considered
- **`@playwright/test` end to end:** tests the whole app through the server, but needs a separate runner, config and a running server for what is one component behaviour.
- **More jsdom stubs:** what 0.3.0 did; it is how the bug got through.
