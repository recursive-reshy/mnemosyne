# 0025. App shell: navigation drawer and colour mode

- Status: Accepted
- Date: 2026-10-16

## Context
Mnemosyne will become one web app with a tab or route per module (transcriber, tutor, wealth tracker). It needs a navigation shell before the second module arrives. The 0.3.0 app also followed the OS colour scheme only, with no way to choose.

## Decision
- **A left navigation drawer**: the mini variant (icons and labels when expanded, icons with tooltips when collapsed) on wide windows, and a temporary overlay drawer on narrow ones. A hamburger in a slim top bar toggles it.
- **The expanded/collapsed state is remembered** per browser in localStorage (`mnemosyne:nav-drawer`), through a `useNavDrawer` hook, inside try/catch. The overlay's open state isn't persisted.
- **Colour mode is three-way: Light, Dark or System**, defaulting to System. It uses MUI's `useColorScheme`, which persists the choice in localStorage. The control sits at the bottom of the drawer.
- **Shell components may use the router**: `NavDrawer` renders items with `NavLink` and reads the location to mark the current item. This is an exception to the "only route components touch the router" rule in `apps/web/CLAUDE.md`.
- In 0.3.1 the drawer has one item, Transcriber (`/`, current on `/jobs/*` too).

## Consequences
- Adding a module means adding a route and one nav item.
- Both preferences are per browser, not per user; that's fine for a single-user, local app.
- If storage is blocked, the app falls back to an expanded drawer and the System mode.

## Alternatives considered
- **Top tabs:** simple, but they don't scale well past a handful of modules and fight the review screen for vertical space.
- **Persisting preferences on the server:** unnecessary for one user on one machine, and it would touch the server in a UI-only release.
- **A two-way light/dark toggle:** loses "follow the OS", which is the most useful default.
