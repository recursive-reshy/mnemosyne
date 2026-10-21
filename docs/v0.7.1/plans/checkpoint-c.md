# Checkpoint C plan: Phase 4 (data router and Settings tabs)

Next: checkpoint C, task 4.1. ADR 0052; TRD §4, §10.1, §10.2 (router). Web only (`apps/web`); no server, shared or agent change. Each task's gate: `pnpm test`, `test:browser`, `lint`, `typecheck` in `apps/web`. Existing tests change only as TRD §10.1 allows; each changed file is listed in the log line.

## Findings that shape the plan
- `renderWithClient` and `renderHookWithClient` (77 test files) use `MemoryRouter` or no router. `useBlocker` throws outside a data router, and `useAutosaveDraft` (via the guard) is exercised by hook tests with no router. So the helpers must move to a memory data router. That change is the "router helper change" TRD §10.1 allows. The public signatures stay, so the 77 callers don't change.
- `useGmailRedirectNotice.test.tsx` uses `MemoryRouter` directly; it moves to the helper.
- The server's OAuth callback redirects to `/settings?gmail=connected|error&reason=…` (`gmail.controller.ts:39`). `/settings` → Prompts would drop the query and the notice (rendered by `GmailSettings`, which moves to Sources) would never show. **Decision for Naresh (see end).**
- `LinkingNotice` links to `/settings`; the linking switch now lives on Models.

## 4.1 Data router (`routes.tsx`, `main.tsx`, `App`, `renderWithRouter`)
Tests first (red → green):
- `routes.test.tsx` (new): `createMemoryRouter( routes, { initialEntries } )` renders HomePage at `/`, JobPage at `/jobs/:id`, a placeholder settings element at `/settings`, and `*` redirects to `/`. Red: `routes` doesn't exist.
- `test-support/renderWithRouter.tsx` (new): `renderWithRouter( path )` renders the real `routes` in the theme + query client; returns `location()` and `queryClient`. Own test.
- `App.test.tsx` moves to `renderWithRouter`; it stops rendering `<App />` bare.
- `renderWithClient` / `renderHookWithClient`: swap `MemoryRouter` for `createMemoryRouter( [ { path: '*', element: ui } ] )` + `RouterProvider`, keeping the `route` option, `location()` and `rerender` (rerender updates the element through a ref/state so component state survives). Hook helper gets a router wrapper too. Run the whole suite; fix only router-related fallout.
Code: `routes.tsx` exports `routes: RouteObject[]` (`App` layout route: `AppShell` + `<Outlet>`, `useRemoveLegacyDrafts`; children `/`, `/jobs/:id`, `/settings/*` → the existing `SettingsPage` for now, `*` → `<Navigate to="/" replace />`). `main.tsx`: `createBrowserRouter( routes )` + `RouterProvider` inside the theme and query providers. `AppShell` keeps taking children (becomes `Outlet` child in `App`).
Changed existing tests: `App.test.tsx`, `useGmailRedirectNotice.test.tsx`, the two helpers' shared use; list in the log.

## 4.2 `useUnsavedChangesGuard`
Tests first (`hooks/useUnsavedChangesGuard.test.tsx`, replaces `useUnsavedChangesWarning.test.ts`): beforeunload prevented when dirty and not when clean (ported); a navigation while dirty shows "Discard unsaved changes?"; Discard completes it, Keep editing (Cancel) stays; a same-path navigation isn't blocked; clean doesn't block. Red: module missing.
Code: `hooks/useUnsavedChangesGuard.ts(x)` takes `isDirty`, uses the `beforeunload` effect + `useBlocker( ( { currentLocation, nextLocation } ) => isDirty && currentLocation.pathname !== nextLocation.pathname )` and returns the `ConfirmDialog` element (`open={ blocker.state === 'blocked' }`, proceed / reset). Delete `useUnsavedChangesWarning` and its test. `useAutosaveDraft` calls the guard with `status !== 'saved'` and returns the dialog element to its caller (`ReviewScreen`/`JobPage` renders it): this adds a field to `AutosaveState`; its existing tests keep passing, with new ones for the field. `PromptProfiles` and `LinkerPrompt` switch to the guard now (they're replaced in 4.4), so no caller keeps the old hook.

## 4.3 `SettingsLayout`, `ModelsTab`, `SourcesTab`
Tests first, per component and in a routes test:
- `SettingsLayout.test.tsx`: heading, three tabs with `role="tab"`, selected tab follows the path, keyboard arrow focus moves between tabs, `/settings` and `/settings/nope` redirect to prompts (replace: Back doesn't return to `/settings`), loading and error states from `useSettings`.
- `ModelsTab.test.tsx`: summary defaults, linking model, linking switch; no agent-reachability text, no linker prompt, no locked instructions.
- `SourcesTab.test.tsx`: feeds and Gmail sections; a labelled slot for the Status panel (6.2); Gmail redirect notice still shows.
- `NavDrawer.test.tsx`: Settings is current on `/settings/models` etc. (red on the exact `=== '/settings'` check).
- The existing `SettingsPage`, `LinkingSettings` and `SummarizerDefaults` tests move to the new components (allowed, TRD §10.1); the removed agent-status assertions in `LinkingSettings.test.tsx` are deleted with the block.
Code: `SettingsLayout` (heading, MUI `Tabs` with `Tab component={ Link }`, `Outlet`; owns `useSettings` loading/error), `ModelsTab` (`SummarizerDefaults` + `LinkingSettings` minus agent-status block and `LinkerPrompt`/linker locked instructions), `SourcesTab` (`FeedSettings`, `GmailSettings`), widths `40rem`. `SettingsPage` and its folder deleted. `routes.tsx` gets the §4.2 tree; `PromptsTab` is a temporary element holding the current `PromptProfiles` plus the locked instructions and `LinkerPrompt` so no control is lost between commits. `NavDrawer`: `isSelected={ pathname === '/settings' || pathname.startsWith( '/settings/' ) }`.

## 4.4 `PromptsTab`, `PromptList`, `PromptPanel`
Tests first:
- `PromptList.test.tsx`: subheaders Summary profiles / Linking; items are links to `/settings/prompts/:id` and `/linker`; default marked with a chip; New, Rename, Delete (blocked reasons via `deleteBlockedReason`), Set as default behave as `PromptProfiles.test.tsx` pins today (ported cases).
- `PromptPanel.test.tsx`: reads `:promptId`; shows editor, history, reset, locked instructions (video + article for a profile; linker's, or the "unavailable while the agent is down" text, for `linker`); save, discard, restore, reset as ported from `PromptProfiles` / `LinkerPrompt` tests; unknown id redirects to `prompts`; dirty edits + selecting another prompt / switching tab / navigating away shows the guard (TRD §10.2).
- `PromptsTab.test.tsx`: wide: list + panel, `/prompts` opens the default profile; narrow (`mockMatchMedia`): `/prompts` shows list only, `/prompts/:id` shows the panel with a back button to the list.
- Browser test (`PromptsTab.browser.test.tsx`) for full-width layout and the 280px list at `md`+.
Code: `PromptList`, `PromptPanel` (reuses `PromptEditor`, `PromptHistory`, `LockedInstructions`, `ProfileActions`, `ProfileNameDialog`, `ConfirmDialog`, `usePromptProfiles`, `usePromptVersions`), `PromptsTab`; "Set as default" uses the existing settings mutation. Delete `PromptProfiles`, `LinkerPrompt` and their folders/tests. Update `apps/web/CLAUDE.md` (router, new components, folder structure, layers: only route components and the guard touch the router). Screenshots light and dark of Prompts (wide and narrow), Models, Sources.

## Order and commits
4.1 → 4.2 → 4.3 → 4.4, one commit each with the `tasks.md` tick and log line, pushed. After 4.4: the checkpoint report (commits, test/lint/typecheck/test:browser results, screenshots, ADRs: none new, no TRD change).

## Verification
Per task: `pnpm --filter web test && test:browser && lint && typecheck`; 4.4 also `pnpm build`. At the end: run the dev server with the real server, open Settings, switch tabs, edit a prompt and try Back / tab / drawer (guard), reload on `/settings/prompts/linker`, screenshot.

## Decisions (approved with the plan)
1. **Gmail OAuth return.** The server redirects to `/settings?gmail=…`. Proposal: the `/settings` index route redirects to `sources` (keeping the query) when `gmail` is present, otherwise to `prompts`. Web-only, no server change. Alternative: change the server redirect to `/settings/sources?gmail=…` (a server change outside this checkpoint).
2. **`LinkingNotice` link** (`/settings`): point it to `/settings/models`, where the linking switch lives. Small web-only change.
If you approve without comment, I'll do both as proposed and record them in the task log lines (no ADR, as neither is a design change beyond ADR 0052).
