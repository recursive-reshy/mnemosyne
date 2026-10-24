# 0068. Web: one gate, module guards, filtered navigation

- Status: Proposed
- Date: 2026-10-24

## Context
The web app assumes it is always usable. With sign-in, vault onboarding and per-user modules, every page must know who the user is and what they may see.

## Decision
- `GET /api/me` (`id`, `email`, `name`, `role`, `modules`, `vault_dir`) drives a root **gate** that shows exactly one of: **Sign in**, **Choose your vault**, **No modules yet**, or the app shell.
- Sign-in is a full-page navigation to `/api/auth/google?returnTo=<path>`; `returnTo` must be a same-origin path. Any 401 invalidates `me` and brings back the sign-in screen, returning to the same page.
- `RequireModule` guards module routes and redirects to the first module the user has. The drawer and Settings tabs show only what the user's modules and role allow; a new **Admin** tab is admin-only. **Sign out** joins the bottom of the drawer.
- Mutating requests always send `application/json` (the server's CSRF guard, ADR 0061).
- The e2e stack signs in through a test-only session route that exists only with `E2E_TEST_SIGNIN=1` and `NODE_ENV=test`.

## Consequences
- One place decides what a user sees; pages don't each check auth.
- A hidden page is also refused by the server (404), so the UI isn't the only guard.
- The iOS home-screen app's separate cookie store may need a different sign-in path; checked by hand at release.

## Alternatives considered
- **A popup sign-in window:** blocked or awkward in installed web apps.
- **Per-page auth checks:** easy to miss on a new page.
