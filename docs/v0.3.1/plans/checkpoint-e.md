# Plan — Checkpoint E (Phase 7: note editor toolbar and dark mode), tasks 7.1–7.5

## Context
Checkpoints A–D are done and 6.3 is confirmed (`ee43f5a`). Checkpoint E gives the note editor what PRD §6.5 asks for: a formatting toolbar (undo/redo, block type, bold, italic, bullet and numbered lists, link), dark mode, and an MUI look for the mode toggle, then removes the last CSS (`NoteEditor.module.css`, `editorTokens.ts`). Still MDXEditor 4.3.3, no new dependency. The ADR 0023 round-trip contract is unchanged; `NoteEditor.test.tsx` and `noteRoundTrip.test.tsx` stay green, with only logged query swaps allowed. Web only.

Per task: failing test first → green → refactor → tick + log line → commit → push; then `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`. 7.5 is not ticked until you confirm.

## What I checked in the MDXEditor API
Context7's quota is out, so I used mdxeditor.dev and, where it was silent, the installed 4.3.3 build (`apps/web/node_modules/@mdxeditor/editor/dist`).

**Dark theme**
- Class is `dark-theme` (`.dark` also works in the stylesheet). It goes in the `className` prop. It flips the Radix colour scale (`--slate-*`, `--blue-*`) that MDXEditor's variables point at.
- `.editorRoot` hard-codes `--basePageBg: white`, and the other colours come from variables: `--accentSolid`, `--accentText`, `--baseBg`, `--baseBorder`, `--baseText`, `--baseTextContrast`, `--basePageBg`. These are what clash with the MUI palette.

**Popups and the link dialog**
- Dropdowns and the link dialog render in a **popup container**. `EditorRootElement` creates a `div.mdxeditor-popup-container` in an effect and appends it to `document.body`. It copies the `className` prop onto it, so `dark-theme` reaches popups with no extra work. An `overlayContainer` prop exists but isn't needed.
- The effect depends on `className`, so a class change removes and recreates the popup container but does not remount the editor (React keeps the same wrapper div and only the class changes). Lexical, the text, selection and undo history are untouched.
- **Risk:** a popup that is open during the switch closes (fine), and any toolbar component that cached the old container's element would portal into a detached node. I'll prove it in a test and in the browser: switch colour mode, then open the block-type dropdown and the link dialog.
- Because popups sit under `<body>`, CSS variables set on the editor wrapper's `sx` don't reach them. **A small difference from TRD §6.6:** the palette mapping goes in `theme.ts` (`MuiCssBaseline` `styleOverrides`) keyed on a class (`noteEditor`) that I also pass in `className`, so it reaches both the editor and its popups. `CssBaseline` is already mounted; this adds no `GlobalStyles` and no CSS file.
- Also from the docs: popups have `z-index: 2` (MUI's drawer and app bar are far higher; not a problem inside the content area, checked in the browser).

**Toolbar**
- Components: `UndoRedo`, `BlockTypeSelect`, `BoldItalicUnderlineToggles options={ [ 'Bold', 'Italic' ] }`, `ListsToggle options={ [ 'bullet', 'number' ] }` (`'check'` omitted), `CreateLink`, `Separator`.
- Accessible names (from the source): Undo/Redo buttons have a `title` ("Undo Ctrl+Z", "Redo Ctrl+Y"); Bold/Italic toggles `aria-label` "Bold" / "Italic", which becomes "Remove bold" / "Remove italic" while active (that is their pressed state, on a Radix toggle item); lists "Bulleted list" / "Numbered list"; link "Create link" (`aria-label` and `title`); the block-type trigger "Select block type"; options are Paragraph, Heading 1–3 (only the allowed levels), Quote.
- `CreateLink` needs `linkDialogPlugin()`, which also adds the Ctrl/Cmd+K shortcut. The only documented option is link autocomplete suggestions; none needed.
- `headingsPlugin( { allowedHeadingLevels: [ 1, 2, 3 ] } )` only restricts the dropdown and the Ctrl+Alt+digit shortcuts. Importing Markdown uses the mdast depth, so `####` headings in existing notes survive. I'll prove it with a fixture rather than assume it.

## 7.1 Dark mode
- Tests first (red: nothing sets the class):
  - `NoteEditor.dark.test.tsx` (or cases in `NoteEditor.test.tsx`, which stays unchanged; a separate file is cleaner): rendered inside the app theme with `mockMatchMedia( { isDark: true } )` the `.mdxeditor` root has `dark-theme`; light has not; the popup container (`.mdxeditor-popup-container`) has the same class.
  - Switching mode does not remount: render, note the `[contenteditable]` element, switch (`act( () => os.setDark( true ) )` with System mode, and also `setMode`), assert the same DOM node, same text; then open the block-type dropdown (once 7.3 adds it; in 7.1 assert the popup container exists and carries the class after the switch).
  - Outside a `ThemeProvider` (the existing `NoteEditor.test.tsx` renders plain), the editor renders light with no error.
  - `theme.test.ts`: `MuiCssBaseline` overrides contain a `.noteEditor` rule that sets the mapped variables from palette variables.
- Implementation: `NoteEditor` reads `colorScheme` from `useColorScheme()` (undefined → light) and passes `className={ isDark ? 'noteEditor dark-theme' : 'noteEditor' }`. Variable mapping in `theme.ts`, a short commented list: `--basePageBg` → paper background; `--baseText` / `--baseTextContrast` → text secondary / primary; `--baseBorder` → divider; `--accentSolid` / `--accentText` → primary; adjusted after looking at it in both modes.
- Browser check: the editor (toolbar, content, source mode) in light and dark, then the colour mode switched while text is typed (text and undo history survive).
- Commit `feat(7.1): note editor dark mode`.

## 7.2 `ModeToggle` on MUI, wrapper, CSS removed
- Tests: `NoteEditor.test.tsx` stays unchanged (buttons stay `button`s named "Rich text" / "Source mode" with `aria-pressed`; the blocked message keeps `role="alert"`). New first: the mode toggle is a named group (`aria-label="Editor mode"`) so it reads as one control (red).
- `ModeToggle`: `ToggleButtonGroup exclusive size="small"`, keeps labels, `aria-pressed` and the front-matter check; blocked message → `Alert severity="error"`.
- `NoteEditor`: the wrapper `div` becomes `Paper variant="outlined"` (`overflow: hidden`, `width: 100%`); content min height and padding go in the wrapper's `sx`, targeting a stable class passed as `contentEditableClassName` (`noteEditorContent`). `caretText.ts` and the caret-sync listeners are untouched (they use the wrapper ref).
- Delete `NoteEditor.module.css`, `editorTokens.ts`, `editorTokens.test.tsx` and the `GlobalStyles` import and line in `main.tsx` (the only stylesheet import left is `@mdxeditor/editor/style.css`).
- **`apps/web/CLAUDE.md` in this commit** (as you asked): remove the `editorTokens.ts` line in Folder structure; change the `components/` line (drop "NoteEditor keeps its own module until v0.3.2"); change the JSX and CSS line to "No `.css` files or CSS modules"; the file's remaining "until v0.3.2" mentions are only these three (checked with grep).
- Commit `feat(7.2): MUI mode toggle, remove editor CSS`.

## 7.3 Toolbar
- **Round-trip test first, and the stop-and-ask gate.** Add one fixture to `test-support/noteFixtures.ts` ("everything the toolbar can write"): H1, H2, H3, a quote with `**bold**` inside, `*italic*`, a `-` bullet list with an inline `**bold**` and a link, a `1.` numbered list, a `[text](url)` link, bold and italic around a link, and a separate fixture with H4–H6 (must survive, since the dropdown stops at H3). The existing parametrised tests in `noteRoundTrip.test.tsx` pick new fixtures up automatically (idempotent, and "keeps exactly" unless the fixture is listed as normalising), so that file is not edited. Expected forms are the ones in TRD §6.6 / PRD §6.5: `#`–`###`, `>`, `**bold**`, `*italic*`, `-`, `1.`, `[text](url)`. Run it before any toolbar code. **If MDXEditor writes any of them differently (for example `_italic_`, `__bold__`, `*` bullets, a different numbering, or changes H4+), I stop and ask you; no workaround.** The existing fixtures already show `**`, `*`, `-`, `#`, `>` and links are fine, so the new information is mostly numbered lists, nesting inside quotes and list items, and H4+.
- Toolbar tests (red: no toolbar):
  - rich-text mode: buttons with accessible names — Undo, Redo, Select block type, Bold, Italic, Bulleted list, Numbered list, Create link; and the mode toggle;
  - no Underline, no check list, no strikethrough, no code toggle;
  - source mode: the mode toggle stays, every formatting button is gone; back to rich text: they return;
  - block-type options are Paragraph, Heading 1–3, Quote (no H4–H6);
  - pressed state (Bold/Italic, block type): asserted if jsdom's selection allows it; otherwise it moves to the browser check and the log line says so.
- Implementation: `FormattingToolbar` (new, in the `NoteEditor` folder) with `UndoRedo`, `Separator`, `BlockTypeSelect`, `Separator`, `BoldItalicUnderlineToggles options={ [ 'Bold', 'Italic' ] }`, `Separator`, `ListsToggle options={ [ 'bullet', 'number' ] }`, `Separator`, `CreateLink`. `NoteEditor`'s `toolbarContents` renders `ModeToggle` plus, only while `viewMode$` is `rich-text`, `FormattingToolbar` (read like `ModeToggle` does). `editorConfig.ts`: `headingsPlugin( { allowedHeadingLevels: [ 1, 2, 3 ] } )` and `linkDialogPlugin()`; nothing else in the plugin list or `noteMarkdownOptions` changes. MDXEditor's own toolbar components are used as they come; none are rebuilt in MUI. `sx`/layout so the toolbar wraps on narrow windows (checked in the browser).
- Browser check (scripted, fake API): every button on a real note in light and dark, then source mode to read the Markdown; the block-type dropdown and link dialog readable in dark mode; colour mode switched mid-edit.
- Commit `feat(7.3): note editor formatting toolbar`.

## 7.4 Docs
- `apps/web/CLAUDE.md`: the editor in Stack and Style (toolbar and what it offers, dark mode via `useColorScheme` and `dark-theme`, the `noteEditor` class and the variable mapping in `theme.ts`, no CSS files at all, MDXEditor's stylesheet import is the only one). Nothing about `editorTokens` (removed in 7.2).
- `README.md`: the editor paragraph (formatting toolbar, what it writes, source mode for the rest; the editor now follows the colour mode: remove the sentence "stays light until 0.3.2" in the UI paragraph) and the roadmap/known-issue lines if they still mention it.
- Root `CLAUDE.md`: it only says the note is "reviewed and edited in the web app" and doesn't describe the editor, so no change (I'll confirm with grep and say so in the log line).
- `docs/README.md` and ADRs: no new ADR (ADR 0019 and 0023 are unchanged; the TRD already holds the decision). I'll say so in the report.
- Commit `docs(7.4): editor toolbar and dark mode`.

## 7.5 Final checks (report, don't tick until you confirm)
- Automated: `find apps/web/src -name "*.css"` is empty; `rg -n "\.css['\"]" apps/web/src` finds only `@mdxeditor/editor/style.css`; `pnpm test` (shared, server, web), lint, typecheck, `pnpm build`; `git diff` for server and shared still empty since 0.3.0.
- Scripted browser run (throwaway `playwright-core`, fake API as in checkpoint D): every toolbar button used on a note in light and dark; source mode shows the expected Markdown (`**`, `*`, `-`, `1.`, `#`–`###`, `>`, `[text](url)`, no `<u>`); the block-type dropdown and link dialog readable in dark; colour mode switched mid-edit while typing, with the text kept and undo still working; narrow window toolbar wraps; the full review flow (folder, properties, autosave, save, discard) still passes.
- **Yours:** a note formatted with the toolbar, saved to a scratch vault with the real server, and opened in Obsidian. I won't start the real server or write into a vault. I'll list the exact steps and stop; 7.5 stays ⬜ until you confirm.
- Commit `docs(7.5): log the scripted verification` (log line only).

## Critical files
Edit: `NoteEditor/{NoteEditor.tsx,ModeToggle.tsx,editorConfig.ts}`, `theme.ts`, `main.tsx`, `test-support/noteFixtures.ts`, `apps/web/CLAUDE.md`, `README.md`, `docs/v0.3.1/tasks.md`.
New: `NoteEditor/FormattingToolbar.tsx`, new tests for dark mode and the toolbar (`NoteEditor/*.test.tsx`).
Delete: `NoteEditor/NoteEditor.module.css`, `src/editorTokens.ts`, `src/editorTokens.test.tsx`.
Unchanged: `noteRoundTrip.test.tsx`, `wikilinkMarkdown.ts`, `caretText.ts`, server, shared.
Reuse: `useColorScheme` (MUI), `viewMode$` / `useCellValue` (as `ModeToggle` does), `mockMatchMedia`, `renderWithClient`.

## Report at the end
Per task with hashes; test/lint/typecheck/build per folder; the round-trip result for the new fixtures; screenshots (light and dark: toolbar, dropdown, link dialog, source mode); the `theme.ts` mapping deviation from TRD §6.6 (sx on the wrapper can't reach popups); anything deferred; the steps for your Obsidian check.

## Risks
- MDXEditor writes a toolbar construct differently (7.3 gate; stop and ask).
- Popup container swap on class change leaves a toolbar component pointing at a stale element (tested in 7.1, checked in the browser; if it fails I stop and bring options).
- jsdom can't drive selection well enough for the pressed-state tests (moves to the browser check, as TRD §8 allows).
- Mapped colours still clash somewhere in dark mode: tuned by eye in 7.1 and 7.3, kept to a short list.
