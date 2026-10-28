# Checkpoint F plan: Phase 7 (web)

## Context
Checkpoints A–E made the server multi-user: Google sign-in and sessions, per-user ownership, per-user vaults, module gating, `/api/admin/*`. The web app still assumes one signed-in person. Checkpoint F adds the gate (sign in → choose vault → no modules → app), module guards, a filtered drawer and Settings, **Sign out**, and the **Admin** tab (ADRs 0061, 0063, 0065, 0067, 0068; TRD §9, §11.3). Six tasks, one commit each (`feat(0.9-7.x): …`, co-author trailer), pushed. Web only; no server or shared change expected (all contracts already exist in `packages/shared/src/auth.ts` and `admin.ts`). No new dependency.

Gate per task: `pnpm test`, `pnpm test:browser`, `pnpm lint`, `pnpm typecheck` in `apps/web`. `pnpm build` at the end. `pnpm e2e` is not run (Checkpoint G, 8.1, adds the test sign-in route; until then the e2e stack can't sign in, so it is expected to fail and is not part of F's report). Each task: failing tests first and watched failing → least code → refactor green → tick Status and log line in `tasks.md` → commit → push.

Existing pieces reused: `request` / `send` (`api/request.ts`), `ApiError`, `ConfirmDialog`, `renderWithClient` / `renderWithRouter`, `mutationStub`, `hookStates`, `useRunBackup`, `useSettings`, `usePromptProfiles` / `useMeleteProfiles`, `NavDrawer` `NavItem`, `SettingsLayout` `TABS`, `AddFeedDialog` as the pattern for a form dialog, `ColorModeControl`, `queryKeys.ts`.

## Decisions (flag if you disagree)
1. **JSON bodies in one place (7.1).** `send` sets `Content-Type: application/json` and a `{}` body on `POST`/`PUT`/`PATCH`/`DELETE` when the caller gave none, so the ~20 existing call sites don't change. Existing api tests that assert exact `fetch` args get the header added; each is listed in the log.
2. **401 handling needs the query client.** `request.ts` can't import a client instance, so `createQueryClient()` gets a `QueryCache` and `MutationCache` `onError` that, for an `ApiError` with status 401, calls `invalidateQueries( { queryKey: meKeys.all } )`. This implements TRD §9.1 inside `queryClient.ts` (already "the app's TanStack Query defaults"), with no module global. `useMe` treats a 401 as signed out: its `queryFn` catches the 401 and returns `null`, so there is no error and no retry loop.
3. **Admin-only bits key off `me.role === 'admin'`** (`useMe`), not a probe request. The server already refuses them, so the UI is not the only guard.
4. **Gate placement.** `AuthGate` is the layout route's element wrapping `App` (so `AppShell`, drawer and `useRemoveLegacyDrafts` only mount once signed in). Gate pages render bare, centered, without the shell. `/signin` is a sibling route outside the gate.
5. **Order of tabs:** Prompts, Models, Sources, Admin; Settings index redirects to the first visible one (keeps the `?gmail=` redirect to Sources when the user has Transcriber). A Melete-only member: Prompts (Melete purposes only) and Models (Melete section only), no Sources. Unknown tab → first visible.
6. **Status panel for members:** the server already filters rows by role, so the panel renders what it gets; only **Back up now** and the feed interval are hidden for non-admins.

## 7.1 Request layer, me/auth/admin api and keys
- **Tests first (red):**
  - `api/request.test.ts`: mutating methods send `Content-Type: application/json` and body `{}` when none; an explicit body is untouched; `GET` unchanged.
  - `queryClient.test.ts`: a query or mutation failing with `ApiError` 401 invalidates `meKeys.all`; other errors don't.
  - `api/me.api.test.ts` (`getMe` returns `Me`, **null on 401**, throws on other errors; `listVaults`, `claimVault`, `createVault` call `GET /api/me/vaults`, `POST /api/me/vault`, `POST /api/me/vault/new` with `{ vault_dir }`), `api/auth.api.test.ts` (`signOut` → `POST /api/auth/signout`, 204), `api/admin.api.test.ts` (`listUsers`, `createUser`, `updateUser`, `resetVault`, `deleteUser` with `{ confirm }`, `getUsage( month? )` with `?month=`, schema parsing).
  - `hooks/useMe.test.tsx`: loads `Me`; 401 → `me: null`, no error, one request only; other error → `error`.
- **Code:** `api/request.ts`, `queryClient.ts`, `api/me.api.ts`, `api/auth.api.ts`, `api/admin.api.ts`, `hooks/queryKeys.ts` (`meKeys`, `adminKeys.users` / `adminKeys.usage( month )`), `hooks/useMe.ts` (returns `{ me, isLoading, error }`).
- **Docs:** `apps/web/CLAUDE.md` "Layers" (`api/` JSON rule and 401).
- **Commit:** `feat(0.9-7.1): me, auth and admin api`.

## 7.2 AuthGate, SignIn, NoModules
- **Tests first:**
  - `AuthGate.test.tsx` (mock `useMe`/api): loading → `role="status"`; 401 → SignIn; `vault_dir: null` → ChooseVault (stub component until 7.3 — see below); no modules (member with `[]`) → NoModules; otherwise the `<Outlet />`. Admin never sees NoModules.
  - `SignIn.test.tsx`: **Sign in with Google** sets `window.location` to `/api/auth/google?returnTo=<encoded path + search>`; `?error=not_allowed|expired|failed` each show a distinct `role="alert"` message ("not allowed" is the plain page the PRD wants); unknown code → generic message.
  - `NoModules.test.tsx`: says the admin hasn't switched anything on, with **Sign out**.
  - Routes: `/signin` renders SignIn; when signed in it redirects to `/`.
  - A sign-in navigation helper is the one place that touches `window.location`; route components only (per the layer rule) — it lives in the `SignIn` route element via a small `useSignIn` hook. Tests stub it.
- **Code:** `components/AuthGate`, `SignIn`, `NoModules` (folders with `index.ts`), `routes.tsx` (gate element, `/signin`), `hooks/useSignOut.ts` (reused by 7.4, `signOut` then invalidate `meKeys.all`), `test-support/me.fixture.ts` (admin, Transcriber-only, Melete-only, no-modules members). Existing route tests (`renderWithRouter`) wrap with a signed-in `me` through the fixture; list changed files in the log.
- **Until 7.3:** the gate renders a placeholder for the vault state only inside the test of 7.2 (a mocked `ChooseVault`); the real component lands in 7.3 in the same checkpoint, so nothing ships half-wired.
- **Docs:** `apps/web/CLAUDE.md` folder structure and Layers (gate, `/signin`).
- **Commit:** `feat(0.9-7.2): auth gate, sign-in and no-modules pages`.

## 7.3 ChooseVault
- **Tests first** (`ChooseVault.test.tsx`): lists unclaimed folders as a radio list with **Use this vault** (disabled until one is chosen); claim sends `{ vault_dir }` and invalidates `me`; **Create new vault** text field shows the `VaultDir` rule as helper text, rejects invalid names inline (no request), submits `createVault`; a 409 shows the server's message in `role="alert"` and refetches the list; empty list shows only the create field; keyboard and labels (every input has a `<label>`).
- `ChooseVault.browser.test.tsx`: phone width (375 px) and desktop, light and dark: no sideways scroll, controls ≥ 44 px (pattern from `MeleteReview.browser.test.tsx`).
- **Code:** `components/ChooseVault`, `hooks/useVaultChoices.ts` (query on `GET /api/me/vaults`, mutations claim/create that invalidate `meKeys.all`; the list query is enabled only while the gate shows this page, since the server answers 409 once a vault exists), wire into `AuthGate`.
- **Commit:** `feat(0.9-7.3): choose your vault`.

## 7.4 RequireModule, drawer filtering, Sign out
- **Tests first:**
  - `RequireModule.test.tsx`: with the module renders children; without it navigates to the first module's home (`transcriber` → `/`, `melete` → `/melete`); Melete-only member visiting `/jobs/x` lands on `/melete`; admin has all.
  - `NavDrawer.test.tsx` (extend): Transcriber-only shows no Melete item; Melete-only shows no Transcriber item; admin shows both; **Sign out** at the bottom calls `signOut` and invalidates `me`; mini (collapsed) drawer shows it as an icon with tooltip; the Settings badge behaviour is unchanged.
  - Route test: unknown path redirects to the home of the user's first module, not always `/`.
- **Code:** `components/RequireModule`, `routes.tsx` (wrap `/`, `jobs/:id` with `transcriber`, `melete/*` with `melete`; the `*` route redirects via the same first-module logic), `NavDrawer.tsx` (filter `NAV_ITEMS` by `me.modules`, add `module` to each item; Sign out item with `LogoutIcon` above the colour control). `NavDrawer.tsx` is near the size limit: if it passes ~150 lines, split `NavItem` into `NavItem/`.
- **Docs:** `apps/web/CLAUDE.md` navigation shell paragraph.
- **Commit:** `feat(0.9-7.4): module guards, drawer filtering and sign out`.

## 7.5 Settings filtering, Sources admin parts, index redirect
- **Tests first:**
  - `SettingsLayout.test.tsx`: tabs for admin (all four incl. Admin), Transcriber-only member (Prompts, Models, Sources), Melete-only member (Prompts, Models); Admin tab absent for members; direct visit to `/settings/admin` or `/settings/sources` without access redirects to the first visible tab.
  - `SettingsIndexRedirect.test.tsx`: first visible tab; `?gmail=` goes to Sources only with Transcriber.
  - `PromptsTab`/`PromptList`: a Melete-only member sees only the two Melete purposes; a Transcriber-only member sees only summary and linker (the server already filters the profile list by purpose; the UI hides empty groups and the default-profile auto-navigate must not run when the user has no summary profiles).
  - `ModelsTab.test.tsx`: sections follow modules.
  - `SourcesTab`/`FeedSettings`/`StatusPanel`: the feed interval select and **Back up now** only for admin; members see their own source rows and no backup/app rows controls.
- **Code:** `SettingsLayout.tsx` (tabs from role and modules, via a small pure `settingsTabs( me )` in `components/SettingsLayout/settingsTabs.ts`), `SettingsIndexRedirect.tsx`, `routes.tsx` (`admin` tab route behind an admin check; `*` → first visible), `PromptsTab`, `ModelsTab`, `FeedSettings`, `BackupControls` / `StatusPanel`.
- **Docs:** `apps/web/CLAUDE.md` route list and Settings tabs.
- **Commit:** `feat(0.9-7.5): settings tabs by role and module`.

## 7.6 Admin tab
- **Tests first:**
  - `AdminTab.test.tsx`: users table (email, name, role, status, modules, vault folder, last sign-in; "—" for none) from mocked `listUsers`; the admin row has no remove/delete/module controls; no link into any user's content.
  - `AddUserDialog.test.tsx`: email, name, module checkboxes; validates with `CreateUserBody` (no request when invalid); 409 duplicate shows the message; success closes and the list refreshes.
  - Row actions (`UserActions`): module switches call `updateUser( { modules } )`; **Remove** → `status: 'removed'`; **Restore**; **Reset vault** opens `ConfirmDialog` then `resetVault`; **Delete user** only for removed users, dialog requires typing the exact email (button disabled until it matches) then `deleteUser( { confirm } )`; server errors show in `role="alert"`.
  - `UsageSection.test.tsx`: month picker (current month default from the response, previous months selectable) refetches with `?month=`; per-user cost by category (summary, linking, melete, extraction) for month and all time; `cost_usd: null` shows "—" not "$0"; transcription as minutes; users with no activity still listed.
  - Browser test: Admin tab at desktop and phone width, light and dark; table becomes cards on narrow screens (as `StatusCard` does).
- **Code:** `components/AdminTab` (+ `UserTable`, `UserActions`, `AddUserDialog`, `DeleteUserDialog`, `UsageSection`, `formatCost.ts`), `hooks/useAdminUsers.ts`, `hooks/useAdminUsage.ts` (mutations invalidate `adminKeys.users`; reset/remove/delete also `adminKeys.usage`), `routes.tsx`. Components split to stay near 150 lines.
- **Docs:** `apps/web/CLAUDE.md`: update the ADR list (0061, 0063, 0065, 0067, 0068), folder structure (gate, SignIn, ChooseVault, NoModules, RequireModule, AdminTab), layers and tests notes (signed-in fixtures).
- **Commit:** `feat(0.9-7.6): admin tab`.

## Verification
- After each task: `pnpm test`, `pnpm test:browser`, `pnpm lint`, `pnpm typecheck` in `apps/web`; `pnpm build` after 7.6.
- Browser check (dev server with the real server behind it and `E2E`-free manual sign-in via Google is not possible without credentials, so use the server's test session helper in a local dev database or run with a stubbed `/api/me`): screenshots, light and dark, of SignIn (with an error), ChooseVault (phone width too), NoModules, the drawer for three user kinds, the Settings tabs and the Admin tab; say what I saw.
- Checkpoint report: commits per task, per-folder results (web only touched; `pnpm e2e` not run, why), screenshots, any ADR (none expected), deferred items.

## Open point for you
Browser screenshots need a signed-in session without Google. If you'd rather not wait for Checkpoint G's test-only session route, I'll run the screenshots against Vite with `/api/me` and `/api/admin/*` stubbed by a throwaway local script (not committed). Say if you'd prefer otherwise.
