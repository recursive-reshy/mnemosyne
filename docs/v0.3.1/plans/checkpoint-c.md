# Plan — Checkpoint C (Phases 4–5: review screen), tasks 4.1–5.3

## Context
Checkpoints A and B gave the app a theme, a shell, and MUI home and job screens. Checkpoint C converts the review screen: layout and transcript (phase 4), then properties, tags and the folder picker (phase 5). Behaviour-neutral, web only. `NoteEditor` (and `ModeToggle`, its CSS module, the MDXEditor stylesheet) is **not touched**. `global.css` stays until 6.1 (the editor's CSS module still needs its three tokens, and `.alert` goes away once the last component stops using it in this checkpoint). Each task deletes its `.module.css`.

Per task: failing test first → green → refactor → tick + log line → commit → push; then `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`.

## Test-first in a behaviour-neutral migration (same approach as checkpoint B)
Existing tests pin behaviour and stay green, so most conversions have no red step. I add a small new test only where MUI gives something new to pin or the old test can't cover a changed element; otherwise I say so in the log line. The one real red/green rewrite is 5.3 (`FolderPicker.test.tsx`, allowed by TRD §6.5): the rewritten tests are written first against the old component (they fail because it has no tree roles), then the component is rewritten.

Recurring MUI facts from checkpoint B that apply here:
- `Alert` has `role="alert"` on its root and the text in an inner element. Tests using `getByRole( 'alert' )` / `getByText` on message text keep working; any assertion of the `role` attribute on a `getByText` result would not (none left in these components, checked by grep).
- A disabled MUI `Button` has `pointer-events: none`; where an existing test clicks a disabled button, restore `pointerEvents: 'auto'` and `cursor: not-allowed` in that button's `sx` (as done in `SubmitForm`).
- Several tests render without the theme (plain `render`); default MUI theme must work, so no theme-only dependencies in component logic.

## Phase 4 — Review, part 1

### 4.1 `ReviewScreen` layout
- `Stack spacing={ 2 }` replaces `.review`; title is `Typography variant="h6" component="h2"` (keeps `overflowWrap: anywhere`); the two columns are a `Box` with CSS grid: one column, and two (`minmax( 0, 1fr )`, `align-items: start`) from the `lg` breakpoint when the review isn't in the failed state. I use `lg` rather than the old 48rem because the permanent drawer now takes 240px of the width; checked in the browser.
- The five inline alerts (`hasFailed`, autosave error, save error, retry error, discard error) become `Alert severity="error"`. The save-status line is `Typography role="status"` with the same `STATUS_LABELS`.
- `NoteEditor` is untouched (its props and wrapper are unchanged; it is only placed in the grid cell).
- Delete `ReviewScreen.module.css`. `ReviewScreen.test.tsx` unchanged and green. Because `ReviewScreen` is 140 lines and the grid/alert JSX adds more, the alert block moves into a small private `ReviewAlerts` helper in the same file only if the file passes ~150 lines; otherwise it stays inline.

### 4.2 `TranscriptPane`
- `Paper variant="outlined" component="section"` with `ref`, `aria-label="Transcript"`, `position: relative` (the scroll code reads `element.offsetTop`), `maxHeight: '32rem'`, `overflowY: auto`, padding 1/2. Errors are `Alert severity="error"`; loading is `Typography role="status"`.
- Paragraphs: `Typography component="p"` keeping `id` (`transcript-<second>`) and `aria-current="true"`; the active one gets the accent left border and bold via an attribute selector in `sx`. The `[mm:ss]` stamp is a `Typography component="span"` in secondary colour with tabular numbers. The `useMemo`/`useEffect` scroll logic does not change.
- The active paragraph is marked by border *and* weight, not colour alone.
- Delete `TranscriptPane.module.css`. `TranscriptPane.test.tsx` unchanged and green (it checks `scrollTop`, `aria-current` and the region).

### 4.3 `ReviewActions`, `NoteDestination`, `FilenamePreview`
- `ReviewActions`: `Stack direction="row"` with a top divider (`borderTop`, `pt`), `Button variant="contained"` for Save / Retry, `Button variant="outlined"` for Discard; labels and disabled rules unchanged. `ReviewActions` has no test file today; ReviewScreen's tests cover it, and I add a short `ReviewActions.test.tsx` (labels per state, disabled rules, handlers) as a net before converting, which should pass first (it is a characterisation test, not a red).
- `NoteDestination`: the error line becomes `Alert severity="error"` (default `role="alert"`, so `getByRole( 'alert' )` in its test still holds); text unchanged.
- `FilenamePreview`: `Typography variant="body2" color="text.secondary"` with the `<code>` path (`overflowWrap: anywhere`). Text nodes unchanged so `getByText( /in the default folder as/ )` and `getByText( 'Mnemosyne/A talk.md' )` still match.
- Delete `ReviewActions.module.css`, `FilenamePreview.module.css` (`NoteDestination` has none).
- **Browser check after 4.3** (review screen in light and dark, wide and narrow, using a real `ready_for_review` job from the running API). Because opening a review autosaves, the script mocks every non-GET `/api/**` request with an empty success so no real draft is touched, and never clicks Save, Discard or Retry.

## Phase 5 — Review, part 2

### 5.1 `TagInput`
- Keep `ul aria-label="Tags"` (`Stack component="ul"`, `direction="row"`, wrap, no list style) with one `li` per tag so `listitem` queries still count `mnemosyne` first. Each `li` holds a `Chip`: `mnemosyne` with no `onDelete`; others with `onDelete`. Input is a `TextField label="Add tag"` (real label) with the same `onChange`, `onKeyDown`, `onBlur` logic.
- **Known friction (flagged now):** MUI renders a Chip that has `onDelete` as a `role="button"` root whose delete icon is an unnamed SVG, so the 0.3.0 queries `getByRole( 'button', { name: 'Remove tag rust' } )` find nothing. Approach: pass a `deleteIcon` that carries the accessible name (`aria-label` `Remove tag <tag>`) and test that the delete click works; if MUI's nested-interactive DOM makes that unreliable, the TRD-permitted fallback is swapping those queries to the equivalent chip-level queries (chip is a button named by its label; delete via the Delete/Backspace key and via the icon). Any such swap is listed in the log line; nothing else about the `TagInput` tests changes. `tagNames()` strips `×` today; with chips it will not need to, and that helper is kept only if still needed.
- Delete `TagInput.module.css`. `PropertiesPanel.test.tsx` (which drives `TagInput`) stays green.

### 5.2 `PropertiesPanel`
- `Stack spacing={ 2 }`; title is `TextField label="Title"` (value from properties, same `update`); `TagInput` as is; the read-only fields are a `dl` (`Box component="dl"`, grid with `dt` / `dd` as `Typography`) so `getByText( 'on save' )` etc. still work; invalid front matter is `Alert severity="warning" role="status"` with the text "front-matter invalid" (the `getByText( 'front-matter invalid' )` in `ReviewScreen.test.tsx` and `getByRole( 'status' )` here both hold).
- Delete `PropertiesPanel.module.css`. `PropertiesPanel.test.tsx` unchanged and green.

### 5.3 `FolderPicker` on `SimpleTreeView`
- Tests first: rewrite `FolderPicker.test.tsx` for tree roles, covering every 0.3.0 behaviour: shows the destination (default / stored / vault root); tree closed until "Change folder" (`aria-expanded` false → true); chosen folder is `aria-selected` (default when nothing stored, stored path otherwise); selecting reports the path, `null` for the default folder, `''` for Vault root; keyboard (arrow keys move focus, Enter selects, Right/Left expand and collapse); filter shows matches with ancestors expanded, ignores case, hides others, says "No folders match"; new folder: created under the chosen one / default / root, only on the client and marked with a "new" chip, selects an existing one without marking it new, rejects bad names (`a/b`, `.hidden`, `..`, `what?`, blank, 101 chars) with the same message and reports nothing, clears the message after a valid name; a stored folder that is not on disk shows it and its ancestors as new, expanded to the chosen one. Run them against the old component: red (no `tree` role). Then rewrite.
- `FolderTree.tsx` becomes `SimpleTreeView` + recursive `TreeItem`s. `itemId` = folder path; Vault root is the first top-level item with the sentinel id `'/'` (a real folder path can never be `/`, since names can't be empty or contain `/` at the ends). Selection is controlled (`selectedItems` = chosen path or the sentinel; `onSelectedItemsChange` ignores `null` and calls `onSelect`, mapping the sentinel to `''`). Expansion is controlled: user toggles are kept in state seeded with the ancestors of the chosen folder when the tree opens (the tree only mounts while open, so a lazy initialiser reseeds it each time), grown when a folder is created, and replaced by "every node that has children in the filtered tree" while a filter is active. `expansionTrigger="iconContainer"` so clicking a name selects without toggling.
- "new" is a small `Chip` (`label="new"`, `size="small"`) in the item label, replacing the "(new)" text.
- `FolderPicker.tsx`: "Change folder" stays a `Button` with `aria-expanded`; filter and new-folder name are `TextField`s with real labels; "New folder" is a `Button type="submit"`; the validation message is `Alert severity="error"` (same `NAME_MESSAGE`); the panel is conditional rendering. If `FolderPicker.tsx` would pass ~150 lines, the filter + create form move to a sibling file by responsibility.
- `treeNodes.ts` and its tests are unchanged. Delete `FolderPicker.module.css`.
- **Risk to settle at the keyboard:** jsdom + `SimpleTreeView` focus handling (the tree manages roving focus), and how the tree item's accessible name is computed (a `treeitem` contains its child group). If a name includes descendants, tests query by `getByRole( 'treeitem', { name: /^Rust/ } )` or use `within` the item's content; I settle this against the real DOM when writing the tests.
- **Browser check after 5.3:** the review screen in light and dark with the folder picker open, using the same non-GET mocking as after 4.3: open the picker, move with arrow keys, select, filter, add a new folder.

## Critical files
Edit: `components/{ReviewScreen,TranscriptPane,ReviewActions,NoteDestination,FilenamePreview,TagInput,PropertiesPanel,FolderPicker}/*.tsx`, `FolderPicker.test.tsx` (rewritten), possibly a few `TagInput.test.tsx` queries (5.1, logged), `docs/v0.3.1/tasks.md`.
New: `ReviewActions.test.tsx`; possibly a split-out file in `FolderPicker/`.
Delete: `ReviewScreen`, `TranscriptPane`, `ReviewActions`, `FilenamePreview`, `TagInput`, `PropertiesPanel`, `FolderPicker` `.module.css` files.
Untouched: `NoteEditor/*`, `treeNodes.ts`, `global.css`.
Reuse: `treeNodes.ts` (`filterTree`, `withExtraFolders`), `isValidFolderName`, `normalizeTag`, `renderWithClient`, existing fixtures.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web` green; `NoteEditor`, `noteRoundTrip` tests untouched and green.
- Browser checks after 4.3 and 5.3 (throwaway `playwright-core` in the scratchpad, non-GET API calls mocked so no real draft is changed), light and dark; `pnpm build` at the end.
- After 5.3, `rg -n "className=\"alert\"" apps/web/src` should be empty (the global `.alert` class is no longer used anywhere; `global.css` itself goes in 6.1).
- Report: tasks with hashes, per-folder results, screenshots, any test query swaps, deferred items.

## Risks
- Chip delete accessibility (5.1) and tree item naming / focus in jsdom (5.3), described above; both can force logged query swaps but not behaviour changes.
- Two-column breakpoint (4.1) is a visual choice (`lg`) made because of the drawer; the browser check confirms it.
- Autosave on opening a review during the browser check is why all non-GET API calls are mocked.
