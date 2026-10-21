# 0052. A data router, Settings as routed tabs, and one unsaved-changes guard

- Status: Proposed
- Date: 2026-10-21

## Context
Settings has grown into one long page (summarizer defaults, prompt profiles, feeds, Gmail, locked instructions, linking), and the prompt editors are squeezed into a 40rem column. The unsaved-changes warning only covers reload and closing the tab (`beforeunload`); moving around inside the app isn't guarded. React Router's `useBlocker`, which guards in-app navigation, works only with a data router, and the app uses `<BrowserRouter>`.

## Decision
- The app moves to `createBrowserRouter` + `RouterProvider` (same `react-router` package). Route objects live in `routes.tsx`; tests use `createMemoryRouter`.
- Settings is a layout route with MUI tabs as links: `/settings/prompts`, `/settings/prompts/:promptId`, `/settings/models`, `/settings/sources`. `/settings` and unknown tabs go to Prompts. `:promptId` is a summary profile id or `linker`.
- Prompts: a list on the left (Summary profiles; Linking) and the selected prompt's editor, history, reset and locked instructions on the right. Below `md`, list and editor are separate screens.
- One hook, `useUnsavedChangesGuard`, combines `beforeunload` with `useBlocker` and the existing confirm dialog. Because the selected prompt is in the address, it guards switching prompts, tabs and pages alike.
- Models: summary model, linking model, linking switch. Sources: Status panel, feeds, Gmail. The agent's reachability moves to the Status panel.

## Consequences
- Tabs and prompts can be bookmarked; Back works.
- Every existing routing test moves to the memory data router.
- Later modules (tutor, validator) can use loaders and blockers if they need them.

## Alternatives considered
- **Tabs as local state:** no router change, but no deep links, and still no in-app guard.
- **A hand-rolled guard on tab clicks only:** misses Back, the drawer and links.
- **Keeping one page with collapsible sections:** less change, but doesn't give the prompt editors room.
