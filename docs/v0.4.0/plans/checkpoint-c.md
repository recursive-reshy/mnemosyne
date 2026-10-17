# Plan — Checkpoint C (Phase 6: web Settings), tasks 6.1–6.6

## Context
Checkpoints A and B put prompt profiles, model choice, settings and summary runs on the server. Checkpoint C gives them a home in the web app: the data layer (API modules, query keys, hooks), a Settings route reached from a gear in the drawer footer, and the Settings page itself (defaults, locked instructions, profile editor with history). Submit-form options, the review-screen info line and the regenerate dialog are checkpoint D. ADRs 0024 (MUI only), 0025 (shell), 0027, 0028, 0029 govern; no new ADR expected.

Every task: failing tests first (watch them fail for the right reason) → least code → refactor while green → tick Status + log line → commit (`feat(<id>): …`) → push. After each: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`. No new dependencies. Tests query by role/label/text, render with `renderWithClient`, and mock at the boundary (components get props; hooks mock `api/`; `api/` stubs `fetch`).

## Findings that shape the plan
- `jobs.api.ts` holds private `send`/`request` helpers (and `vault.api.ts` still has its own older inline copy). 6.1 moves `send`/`request` (and the local `Schema` type) into `api/request.ts`; `jobs.api.ts` behaviour and its tests stay unchanged. I leave `vault.api.ts` alone: TRD §7.1 lists four modules, and touching a fifth is outside the task.
- Existing hooks: queries via `useQuery` returning plain state objects (`useJob`, `useFolders`), mutations returning `UseMutationResult` and updating the cache in `onSuccess` (`useRetrySummary`, `useDiscardJob`); hook tests use `renderHookWithClient` with the `api/` module mocked. New hooks follow these.
- `NavDrawer` footer is currently `<Box sx={{ mt: 'auto', p: 1 }}><ColorModeControl/></Box>`; `NAV_ITEMS` stays untouched (TRD §7.2: Settings is a utility entry, not a module). Item markup (`ListItemButton component={ Link }`, `Tooltip` when `isMini`, `aria-current`, `onClick={ isNarrow ? onClose : undefined }`) is reused by the Settings item.
- 6.3 adds the `/settings` route, which needs a component: 6.3 creates a minimal `SettingsPage` (title "Settings" and a "Summarizer" section heading, route-level loading/error come in 6.4), and 6.4 fills it in. Small split of the TRD's component list across the two tasks.
- Several Settings tests need the same data (profiles, versions, models, settings). I'll add one `test-support/summarizer.fixture.ts` (`profileFixture`, `versionFixture`, `modelsFixture`, `settingsFixture`), like the existing `job.fixture.ts`, created in 6.2 where hook tests first need it.
- Dirty-state design for 6.5: `PromptProfiles` owns the selected profile id and the draft text (`null` = untouched), derives `isDirty` (trimmed draft differs from the current version's guidance) and passes it down; `PromptEditor` is presentational. A `useUnsavedChangesWarning( isDirty )` hook in `hooks/` owns the `beforeunload` listener (effects live in hooks). One small shared `ConfirmDialog` serves the delete, reset and switch-profile confirms (three uses, so it earns its place); `ProfileNameDialog` handles create and rename.
- Files stay under about 150 lines (`apps/web/CLAUDE.md`), so Settings is split by responsibility exactly as TRD §7.3 lists, plus `ConfirmDialog`.
- Docs: `apps/web/CLAUDE.md` (routes, Settings components, drawer footer, ADR list) and the README are task 8.1, not this checkpoint.
- The browser check from `apps/web/CLAUDE.md` is part of the checkpoint report: dev server with the real server on a throwaway `DATA_DIR`, screenshots in light and dark, wide and narrow, of the Settings page and the drawer footer (collapsed and expanded). If no browser tool is available in this session I'll say so in the report rather than skip it silently.

## 6.1 API modules, query keys
- `api/request.ts`: `send( input, init? )` and `request( input, schema, init? )` moved verbatim from `jobs.api.ts`. Tests first (`request.test.ts`, `fetch` stubbed): `send` rejects with `ApiError( 'Could not reach the server', null )` on a network failure, uses the server's `{ error }` message on a non-2xx, falls back to `Request failed with status N`; `request` parses with the schema and throws `ApiError( 'Unexpected response from the server', status )` on a mismatch. Red: module missing. Then `jobs.api.ts` imports from it; the existing `jobs.api.test.ts` passes unchanged.
- `settings.api.ts`: `getSettings()` → `GetSettingsResponse`, `updateSettings( body )` (PATCH JSON). `models.api.ts`: `listModels()` → `ListModelsResponse`. `prompts.api.ts`: `listProfiles`, `createProfile( body )`, `renameProfile( id, name )`, `deleteProfile( id )` (204, via `send`), `listVersions( id )`, `saveVersion( id, guidance )`, `restoreVersion( id, versionId )`, `resetProfile( id )`; ids go through `encodeURIComponent`. Tests first per module with `fetch` stubbed: exact URL, method, headers and JSON body; return values parsed with the shared schemas; error and bad-response cases for one representative function each.
- `jobs.api.ts`: `createJob( url, options? )` sends `{ url }` alone when there are no options (existing test unchanged) and adds `model` / `profile_id` only when defined; new `regenerateSummary( id, body )` POSTs `…/regenerate-summary` and returns the `Job`. Tests first for both.
- `hooks/queryKeys.ts` gains `settingsKeys.all`, `modelKeys.all`, `promptKeys.profiles`, `promptKeys.versions( id )` (TRD §7.1), with a small test for the exact key shapes.

## 6.2 Hooks
Tests first for each (`api/` mocked, `renderHookWithClient`); fixtures added in `test-support/summarizer.fixture.ts`.
- `useSettings()` → `{ settings, lockedInstructions, isLoading, error, updateSettings }` (query on `settingsKeys.all` plus an update mutation that writes the response into the cache and surfaces errors).
- `useModels()` → `{ models, source, isLoading, error }`, `staleTime` one hour (test: no refetch within the hour on remount).
- `usePromptProfiles()` → `{ profiles, isLoading, error, createProfile, renameProfile, deleteProfile, saveVersion, restoreVersion, resetProfile }`; each mutation invalidates `promptKeys.profiles` and, where it touches versions (save, restore, reset), that profile's versions key. Tests: the query result; each mutation calls its `api/` function with the right arguments and invalidates the right keys; a failed mutation reports its message and leaves the cache.
- `usePromptVersions( profileId | null )` → `{ versions, isLoading, error }`, disabled for `null`.
- `useRegenerateSummary( jobId )` → mutation like `useRetrySummary`: puts the returned job in `jobKeys.detail( jobId )` and invalidates `jobKeys.all` (exact). Used in checkpoint D.
- `useUnsavedChangesWarning( isDirty )` is added with 6.5 where it is first needed.

## 6.3 `/settings` route and the drawer Settings item (ADR 0025)
- Tests first. `NavDrawer.test.tsx`: a "Settings" link to `/settings` sits in the drawer, above the colour-mode control; collapsed it keeps its accessible name and shows a tooltip on hover; `aria-current="page"` on `/settings` only, and Transcriber is not current there; on a narrow window clicking it calls `onClose` and navigates. `App.test.tsx` gets a case: route `/settings` renders the Settings page heading. Existing NavDrawer and App tests unchanged. Red: no item, no route.
- Green: `NavDrawer` footer becomes `Divider`, the Settings `ListItemButton` (gear icon `@mui/icons-material/Settings`, same item markup and tooltip handling as the nav items; a small private `current` check from `useLocation`), then `ColorModeControl`. `App.tsx` adds `<Route path="/settings" element={ <SettingsPage /> } />`. Minimal `components/SettingsPage/` (title and section heading only).

## 6.4 `SettingsPage`, `SummarizerDefaults`, `LockedInstructions` (ADRs 0027, 0028)
- Tests first (hooks mocked at the `hooks/` boundary or `api/` mocked; components get data from `useSettings`, `useModels`, `usePromptProfiles`):
  - `SettingsPage`: title "Settings", "Summarizer" section; loading state while queries load; an error `Alert` with the message when settings fail to load.
  - `SummarizerDefaults`: "Default model" and "Default prompt profile" selects show the current values by display name / profile name; choosing another option calls `updateSettings` at once with only that field, and a `role="status"` "Saved" line appears on success; a failed save shows an `role="alert"` message and no "Saved"; with `source: 'fallback'` an info alert says the model list is offline; while loading the selects are disabled; a saved default model that is not in the list still appears (as its id) so the select is valid.
  - `LockedInstructions`: collapsed accordion titled "Instructions the app always sends"; expanding shows the text read-only (not an editable field).
- Green: the three components (`SettingsPage` composes the other two and `PromptProfiles` once it exists in 6.5).

## 6.5 `PromptProfiles`, `PromptEditor`, `ProfileNameDialog`, `ConfirmDialog`, delete guards (ADR 0027)
- Tests first:
  - `PromptEditor`: multiline "Guidance" field in monospace shows the current guidance; a character count "n / 20,000"; editing marks "Unsaved changes" (text); **Save** disabled when unchanged, empty or over the limit and calls `onSave` with the text otherwise; **Discard changes** restores the text; **Reset to default** appears only when `can_reset`, and confirming (dialog) calls `onReset`, cancelling doesn't.
  - `PromptProfiles`: picker "Prompt profile" lists profiles with the default marked "(default)" and starts on the default; choosing another shows its guidance; with unsaved changes, choosing another opens a confirm ("discard changes?") — confirm switches, cancel stays; Save calls `saveVersion`; **New profile** opens `ProfileNameDialog` prefilled with the viewed profile's guidance, creating selects the new profile; **Rename** opens it with the name; a 409 from the server shows its message in the dialog and keeps it open; **Delete** is disabled with a tooltip reason for the default and for the last remaining profile, and otherwise asks to confirm, then deletes and selects the default.
  - `useUnsavedChangesWarning`: adds a `beforeunload` handler that calls `preventDefault` while dirty, none when clean, removed on unmount.
  - `ProfileNameDialog`: name 1–60 characters (trimmed) with Save disabled otherwise; New mode also has a guidance field prefilled; Cancel closes without calling.
- Green: components and the hook, with `PromptProfiles` owning `selectedId` and `draft` as described above and mounted in `SettingsPage`.

## 6.6 `PromptHistory` (ADR 0027)
- Tests first: lists the selected profile's versions newest first with version number, date, source label ("Shipped default", "Edit", "Restore", "Reset") and the first line of the text; selecting one shows its full guidance read-only; **Restore this version** is offered for every version except the current one and calls `restoreVersion`, after which the local draft is cleared and the new newest version is shown; empty/loading/error states.
- Green: `PromptHistory` mounted under the editor in `PromptProfiles`, using `usePromptVersions`.

## Critical files
- New: `src/api/{request,settings.api,models.api,prompts.api}.ts` (+ tests), `src/hooks/{useSettings,useModels,usePromptProfiles,usePromptVersions,useRegenerateSummary,useUnsavedChangesWarning}.ts` (+ tests), `src/test-support/summarizer.fixture.ts`, `src/components/{SettingsPage,SummarizerDefaults,LockedInstructions,PromptProfiles,PromptEditor,ProfileNameDialog,ConfirmDialog,PromptHistory}/` (each with `index.ts`, component and test).
- Edit: `src/api/jobs.api.ts` (+ test), `src/hooks/queryKeys.ts`, `src/components/NavDrawer/NavDrawer.tsx` (+ test), `src/App.tsx` (+ test), `docs/v0.4.0/tasks.md`.
- Reuse: the `ApiError` class, the item markup and tooltip handling in `NavDrawer`, `useRetrySummary` as the model for `useRegenerateSummary`, `renderWithClient` / `renderHookWithClient`, the shared schemas and types from `@mnemosyne/shared`.

## Verification
Per task: web `pnpm test`, `pnpm lint`, `pnpm typecheck`. Shared and server are untouched; I run their suites once at the end to confirm. End of checkpoint: `pnpm build` in web; start the server on a temporary `DATA_DIR` and the Vite dev server, open `/settings` and walk through: change the default model and profile, edit and save a profile, see the dirty marker and the switch confirm, browse history and restore, reset a shipped profile, create / rename (duplicate name message) / delete (guards), expand the locked instructions; take screenshots in light and dark, wide and narrow, and the drawer footer collapsed and expanded. The report lists tasks with commit hashes, results per package, ADRs (none expected), any existing-test edits (none expected beyond new cases), and the browser findings.

## Open points for approval
1. 6.3 creates a heading-only `SettingsPage` so the route has something to render; 6.4 completes it.
2. `vault.api.ts` keeps its own copy of the request helpers (not in the task list).
3. A shared `ConfirmDialog` component and a `useUnsavedChangesWarning` hook are added beyond the TRD §7.3 list; both are used more than once or hold the `beforeunload` effect.
