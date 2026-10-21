# Checkpoint D plan: Phase 7 (web)

Next: **Checkpoint D, task 7.1** (Plan cell ⬜). On approval: save this to `docs/v0.7.0/plans/checkpoint-d.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint D`, push, then start 7.1.

Read for this checkpoint: PRD §5–6.5, TRD §4, §7, §9, `tasks.md`, ADRs 0044, 0045, 0046, 0047, `apps/web/CLAUDE.md`. All work is in `apps/web` (shared and server are done). Every task: red (watch it fail for the right reason) → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: `pnpm test`, `pnpm test:browser`, `pnpm lint`, `pnpm typecheck` in `apps/web` (never `--fix`). Component tests use `renderWithClient`, mock the `api/` modules and hooks; `api/` tests stub `fetch`; no real server, network or sleeps.

## Decisions taken while planning (flagged so you can object)
1. **`useJob` already polls `linking`.** `FINISHED_STATUSES` lists the final statuses, so every other status polls. 7.1 adds a test that pins it rather than a code change (TRD §7.1 says "add `linking` to that list"; there is no such list).
2. **The linker profile isn't in `GET /api/prompt-profiles`** (summary only, TRD §6.6), so `LinkingSettings` can't read its current version from `usePromptProfiles`. It uses `usePromptVersions( linker_profile_id )` (versions come newest first; the current one is `versions[ 0 ]`) and the existing `usePromptProfiles` mutations (`saveVersion`, `restoreVersion`, `resetProfile`), which already invalidate the `prompt-profiles` prefix and so refresh the versions. `canReset` is `true` (the server owns the real rule).
3. **`useSettings` is extended in 7.1** (TRD §7.1): it also returns `agentStatus` and `linkerLockedInstructions`. `settingsState` in `test-support/hookStates.ts` follows. The fixture already carries the linking fields (`LINKER_ID`, `agent_status`).
4. **`useAutosaveDraft` gains `replaceNote( next )` and `markSaved( note )`** (7.4), because TRD §7.3 says "update the autosave hook's note to `next` without scheduling a save". `replaceNote` clears the timer, sets the latest note and status `unsaved`, and schedules nothing. After the accept request succeeds, `markSaved` sets the sent note (and the server note) only if the latest note is still `next`, so text typed in between still autosaves. If the request fails, the note stays dirty and the next edit or flush stores it (TRD: "the suggestion stays pending").
5. **Accept goes through the existing `value` prop of `NoteEditor`.** It exposes no `getMarkdown` / `setMarkdown`; the review screen's `autosave.note` is the editor's latest Markdown (set on every change), and changing the `value` prop already calls `setMarkdown` in `NoteEditor`. So `NoteEditor` stays untouched (TRD §7.5). Risk: `setMarkdown` may fire `onChange` with the same text, which schedules a harmless no-op autosave (`latest === sent` after `markSaved`). A **browser test** with the real editor checks this (7.4).
6. **Running linking unmounts the review screen** (the job becomes `linking`, `JobPage` shows `JobProgress`). As with regenerate, the handler calls `autosave.cancelPending()` first and sends the editor text as `note_markdown`, so the unmount flush never meets a `linking` job (409).
7. **Where things sit on the review screen.** The tabs live in the right column (not for `summary_failed`, which stays single-column). Both panes stay mounted and the hidden one gets `hidden`, so the transcript keeps its scroll position and caret sync keeps working. The linking alert / Retry linking / Run linking / not-configured note go in a **`LinkingNotice` above the columns** so a failed run is seen even when the Source tab is open; **Re-run linking** sits in the panel header.
8. **"Agent configured"** is `agentStatus !== 'not_configured'` from `useSettings`. A job with `link_state = 'off'` shows **Run linking** when configured, the Settings note when not.
9. **Settings placement:** `LinkingSettings` goes after the summarizer's locked-instructions accordions, under its own "Linking" heading (the TRD says "after Summarizer").
10. **Stale debounce:** a small `useDebouncedValue( value, 300 )` hook feeds the panel. Accept actions use the live note, never the debounced one.
11. No new dependency, no new ADR expected.

## 7.1 API, keys and hooks (ADR 0045)
Files: new `api/linkSuggestions.api.ts`, `hooks/queryKeys.ts`, new `hooks/useLinkSuggestions.ts`, `useAcceptLinkSuggestions.ts`, `useRejectLinkSuggestions.ts`, `useRunLinking.ts`, `hooks/useSettings.ts`, `test-support/hookStates.ts`; tests beside each.
- **Tests first:**
  - `linkSuggestions.api.test.ts` (`fetch` stubbed): `listLinkSuggestions` GETs `/api/jobs/:id/link-suggestions` and parses `ListLinkSuggestionsResponse`; `acceptLinkSuggestions` POSTs `{ ids, note_markdown }` to `…/accept` and returns `{ job, suggestions }`; `rejectLinkSuggestions` POSTs `{ ids }`; `runLinking` POSTs `{}` or `{ note_markdown }` to `/api/jobs/:id/linking` and returns the job; each throws the server's `{ error }` message on a non-2xx and rejects an unparseable body.
  - `queryKeys.test.ts`: `linkSuggestionKeys.list( id )` sits under `jobKeys.detail( id )`.
  - `useLinkSuggestions.test.ts`: fetches only when `enabled`; returns `suggestions`, `isLoading`, `error`.
  - `useAcceptLinkSuggestions.test.ts` / `useRejectLinkSuggestions.test.ts`: on success the job cache and the suggestion cache are set from the response with no refetch; the list key is invalidated; on error both caches are untouched and the message is reported.
  - `useRunLinking.test.ts`: success puts the returned `linking` job in the cache, drops the suggestion cache and invalidates the job list; error leaves the job as it was.
  - `useJob.test.ts`: a `linking` job keeps polling; `ready_for_review` stops.
  - `useSettings.test.ts`: returns `agentStatus` and `linkerLockedInstructions` from the response.
- **Green:** wrappers over `request` with the shared schemas; mutations copy `useRetrySummary`'s cache handling; `useSettings` adds the two fields.
- Red: modules missing; `useSettings` result lacks the fields.

## 7.2 `JobProgress` Linking step (ADR 0044)
Files: `components/JobProgress/JobProgress.tsx` (+ test).
- **Tests first:** a `linking` video job shows Transcribing…Summarizing complete, **Linking** current (`aria-current="step"`), Ready for review pending, and the status line "Linking…"; the same for an article job; a `ready_for_review` job with `link_state` `linked` or `failed` shows Linking complete; a job with `link_state = 'off'` or `null` shows exactly the 0.6.0 steps (no Linking).
- **Green:** `VIDEO_STAGES` / `ARTICLE_STAGES` gain a `linking` entry between Summarizing and Ready; the list drops it unless the job reached it (`status === 'linking'` or `link_state` is `pending`, `linked` or `failed`).
- Red: no Linking step in the list.

## 7.3 `LinkSuggestionsPanel` rows (ADR 0045)
Files: new `components/LinkSuggestionsPanel/` (`LinkSuggestionsPanel.tsx`, `LinkSuggestionRow.tsx`, `index.ts`, tests), `test-support/linkSuggestion.fixture.ts`.
- **Tests first** (props only, no hooks): rows in position order; each shows `[[Target]]`, a kind chip ("Existing note", "Existing concept", "New concept"; the kinds differ by more than colour), the placement (`at "anchor"` or `Related`) and the reason; **Stale** chip when `isStale( note, s )`, with the button **Add to Related** instead of **Accept**; **Add to Related** for an unanchored one too; "Already linked" when `hasWikilink( note, target )`; accepted and rejected rows collapse to one line with a status word and no buttons; pending count in a `role="status"` line; empty state text; callbacks `onAccept( s )`, `onReject( s )` with the suggestion; buttons disabled while `isBusy`.
- **Green:** `LinkSuggestionRow` (one row) split from the list; chips from a module-level `as const` map; `isStale` / `hasWikilink` from `@mnemosyne/shared`.
- Red: component missing.

## 7.4 Review tabs and the accept / reject flow (ADR 0045)
Files: `ReviewScreen.tsx` (+ test), new `components/LinkReview/` (tabs, panel, source pane and the accept / reject handlers), `hooks/useAutosaveDraft.ts` (`replaceNote`, `markSaved`), new `hooks/useDebouncedValue.ts`, `LinkSuggestionsPanel` (**Accept all**, **Reject all** buttons), `ReviewScreen.browser.test.tsx`.
- **Tests first:**
  - `useDebouncedValue.test.ts` (fake timers): the value follows 300 ms after the last change.
  - `useAutosaveDraft.test.ts`: `replaceNote` sets the note, status `unsaved`, schedules no save (advance past the debounce, no `updateDraft` call); `markSaved( note )` makes it clean when the latest note matches and leaves it dirty when the user typed on; a later edit still saves.
  - `ReviewScreen.test.tsx` (hooks mocked): tabs **Suggested links (n pending)** and **Source**; opens on Suggested links when any are pending, else Source; `summary_failed` has no tabs. **Accept** on an anchored suggestion sets the editor text to `insertLink` output, cancels the pending autosave timer, and calls the accept mutation with `{ ids: [ id ], note_markdown: next }`; stale or unanchored goes to `## Related`; **Accept all** applies every pending suggestion in position order to one running string and sends one request with all ids; **Reject** and **Reject all** send ids only and leave the note alone; on an accept error the panel shows the message, the suggestion stays pending and the editor keeps the text.
  - `ReviewScreen.browser.test.tsx` (Chromium and WebKit, real editor): accepting an anchored link puts `[[Target|anchor]]` in the editor, the Markdown round-trips, the autosave sends once with the same text and does not loop, and the Source tab's caret sync still works.
- **Green:** `LinkReview` renders MUI `Tabs`, the panel and `SourcePane` (hidden, not unmounted); handlers use `insertLink` with `asRelated` for stale ones and `autosave.replaceNote` → accept mutation → `markSaved`.
- Red: no tabs; accept does nothing.

## 7.5 Failure, retry, re-run, run, not configured, usage (ADR 0044)
Files: new `components/LinkingNotice/`, `ReviewScreen.tsx`, `LinkReview` / panel header (Re-run), `components/SummaryInfo/` (`SummaryInfo.tsx`, `formatSummaryInfo.ts`; tests).
- **Tests first:**
  - `LinkingNotice.test.tsx`: `link_state = 'failed'` → alert with `link_error` and **Retry linking**; `'off'` and configured → **Run linking**; `'off'` and `not_configured` → a note with a link to `/settings`; `'linked'`, `'pending'` and `null` → nothing. Buttons disabled while running; a run error shows in an alert.
  - `ReviewScreen.test.tsx`: Retry and Run linking call `runLinking` with the editor text after `cancelPending`; **Re-run linking** (`linked`) confirms first when any suggestion is pending and sends `note_markdown`, runs straight away otherwise.
  - `formatSummaryInfo.test.ts`: a `formatLinkInfo` line (model name, prompt version, tool calls, tokens, cost or tokens only, "Last attempt failed", attempts and total) mirroring the summary's rules.
  - `SummaryInfo.test.tsx`: shows the linking line when `link_usage` is set, nothing when null.
- **Green:** `LinkingNotice` above the columns; Re-run in the panel header with `ConfirmDialog`; `SummaryInfo` takes an optional `linkUsage`.
- Red: component missing, no linking line.

## 7.6 `LinkingSettings` (ADR 0046)
Files: new `components/LinkingSettings/` and `LinkerPrompt/` (editor and history), `SettingsPage.tsx`, `apps/web/CLAUDE.md`; tests beside.
- **Tests first:**
  - `LinkingSettings.test.tsx`: agent status text for `ok`, `unavailable` ("Linking is skipped until it's back") and `not_configured` (setup hint with `AGENT_SECRET`); the **Link notes automatically** switch reflects `linking_enabled` and saves `{ linking_enabled }`; the **Linking model** select lists `useModels` and saves `{ linking_model }`, keeps an unlisted current model visible and shows the offline-list note as `SummarizerDefaults` does; locked instructions shown in a `LockedInstructions`, or "Unavailable while the agent service is down" when null.
  - `LinkerPrompt.test.tsx`: editor shows `versions[ 0 ].guidance`; Save calls `saveVersion( { id: linker_profile_id, guidance } )`; Reset confirms and calls `resetProfile`; History marks the current version and Restore calls `restoreVersion`; unsaved-changes warning when dirty.
  - `SettingsPage.test.tsx`: the Linking section is shown after the summarizer content.
- **Green:** reuse `PromptEditor`, `PromptHistory`, `LockedInstructions`, `useModels`, `usePromptProfiles` mutations, `usePromptVersions`, `useUnsavedChangesWarning`. `apps/web/CLAUDE.md` names `LinkSuggestionsPanel`, `LinkReview`, `LinkingNotice`, `LinkingSettings`, `LinkerPrompt`, the new hooks, and adds ADRs 0044–0046 to its list.
- Red: component missing.

## End of checkpoint
Run `pnpm -r test|lint|typecheck`, `pnpm --filter @mnemosyne/web test:browser` and `build`. Screenshots (light and dark) of the review screen with suggestions (pending, stale, decided), the Linking progress step, the failure alert and Settings → Linking, taken with the dev server on a scratch database seeded with a `linked` job, so no Claude call is needed. Report as the root `CLAUDE.md` asks, and name anything deferred (rich-text wikilink chips stay KIV).
