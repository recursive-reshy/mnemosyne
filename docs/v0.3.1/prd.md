# Mnemosyne v0.3.1 — Product Requirements

## 1. Summary
v0.3.1 moves the web app from hand-written CSS to Material UI (MUI). From now on MUI is the only source of UI components and styling. The release also adds an app shell, a collapsible navigation drawer on the left, and a light / dark / system colour-mode toggle. As a last push, the note editor gets a formatting toolbar and follows the colour mode (§6.5). Nothing about how transcription, review or saving works changes.

## 2. Background
Up to 0.3.0 the web app was styled by hand: one global stylesheet of colour and spacing tokens, plus a CSS module per component (15 files, about 500 lines). That was fine for one or two screens. The next modules (the AI tutor, later a wealth tracker) will live in the same web app as their own tabs. Before adding them, the app needs:
- one component library, so every new screen looks consistent without new CSS;
- a navigation shell that new modules can slot into;
- a colour mode Naresh controls, instead of always following the OS.

Naresh is fine with the app looking like a Google / Material app.

## 3. Goals
- Every screen is built from MUI components and themed from one place.
- The app has a shell that is ready for more modules.
- Light, dark or system colour mode can be chosen, and the choice is remembered.
- Everything that worked in 0.3.0 works the same way in 0.3.1.

## 4. Non-goals
- **No business-logic change.** The server, `packages/shared`, the API, the job flow, autosave, the save flow and the note format are untouched.
- **The editor library is not replaced.** `NoteEditor` stays on MDXEditor. It gains a toolbar and dark mode (§6.5), but how notes are written (the ADR 0023 round-trip contract) does not change.
- No new modules or nav items beyond Transcriber.
- Pixel-matching the 0.3.0 look is not a goal. Matching its behaviour is.

## 5. User flow
1. Open the app. A slim top bar shows a hamburger button and "Mnemosyne". A drawer on the left lists the modules. For now it holds only **Transcriber**, which goes to the home page.
2. The hamburger collapses the drawer to icons only, or expands it to icons and labels. The choice survives a reload.
3. On a narrow window the drawer is hidden. The hamburger opens it over the page, and picking an item closes it.
4. At the bottom of the drawer, a colour-mode control offers **Light**, **Dark** and **System**. System is the default. The choice survives a reload.
5. Submitting a URL, following a job, downloading, reviewing, picking a folder, editing properties, autosave, saving and discarding all work as in 0.3.0. They are now drawn with MUI components.

## 6. Features

### 6.1 Material UI as the single UI library
As a developer, I want one component library so new screens don't need hand-written CSS.
- [ ] Every screen and component uses MUI components, themed through one MUI theme. Inside the editor, MDXEditor's own toolbar buttons are used, themed to fit.
- [ ] No `.css` files or CSS-module imports remain. The only stylesheet import left is MDXEditor's own.
- [ ] Error messages are MUI alerts; progress and save status are still announced to screen readers as before.
- [ ] Inputs keep their visible labels, and buttons and links stay real buttons and links.

### 6.2 App shell and navigation drawer
As a user, I want a navigation menu on the left that can grow as more modules are added.
- [ ] The top bar has a hamburger button and the app name.
- [ ] On wide windows the drawer is permanent: expanded shows icons and labels, collapsed shows icons only, with a tooltip on hover.
- [ ] The hamburger toggles expanded / collapsed, and the state is remembered across reloads.
- [ ] On narrow windows the drawer is an overlay, closed by default, opened by the hamburger, and closed by choosing an item, clicking outside or pressing Escape.
- [ ] The **Transcriber** item shows as current on the home page and on job pages.
- [ ] The drawer and hamburger work with the keyboard, and the hamburger tells screen readers whether the menu is open.

### 6.3 Colour mode
As a user, I want to choose light or dark mode myself.
- [ ] A three-way control (Light / Dark / System) sits at the bottom of the drawer. When the drawer is collapsed, it becomes a single icon button that opens the same three choices.
- [ ] System follows the OS setting and changes live when the OS changes.
- [ ] The choice is remembered across reloads. On load the page doesn't flash the wrong mode.
- [ ] Both modes are readable everywhere, the editor included, and no state is shown by colour alone.

### 6.4 Folder picker as a tree view
As a user, I want the folder picker to behave like a proper tree.
- [ ] The picker uses a tree view that can be expanded and collapsed, with keyboard navigation (arrow keys, Enter).
- [ ] Everything it does in 0.3.0 still works: default folder selected, filter with ancestors shown, vault root, new folders marked "new", invalid names rejected with the same message.

### 6.5 Note editor toolbar and dark mode
As a user, I want to format my note with buttons, the way I can in GitLab, and to read it in dark mode.
- [ ] In rich-text mode, a toolbar next to the Rich text / Source mode toggle offers: undo and redo; block type (paragraph, Heading 1, Heading 2, Heading 3, quote); bold and italic; bulleted and numbered lists; insert or edit a link.
- [ ] The formatting buttons are hidden in source mode, where the Markdown is edited directly. The mode toggle stays in both modes.
- [ ] Every control has an accessible name and a tooltip, and exposes its state to screen readers (for example, Bold shows as on while the cursor is in bold text). MDXEditor's own controls are used as they come: the formatting toggles are radio-style items with `aria-checked`, and the block type is a combobox.
- [ ] What the buttons produce is plain Markdown that Obsidian reads as expected: `#`–`###` headings, `>` quotes, `**bold**`, `*italic*`, `-` bullets, `1.` numbered lists, `[text](url)` links. No underline, because Markdown has no underline and it would be written as HTML.
- [ ] The editor follows Light / Dark / System like the rest of the app: text, background, toolbar, dropdowns and the link dialog are all readable in both modes, and switching modes while editing doesn't lose text or the cursor.
- [ ] The Rich text / Source mode toggle and its "Fix the front-matter" message look like the rest of the app.

## 7. Constraints
- Single user, local, as before. The colour mode and drawer state are per browser (localStorage). If storage is blocked, the app still works with the defaults.
- New dependencies limited to: `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, `@mui/x-tree-view` (free tier).

## 8. Out of scope for 0.3.1 (KIV)
- **v0.3.2:** timestamp click / caret sync in a real browser; lazy-loading the editor (bundle size).
- Tutor and wealth-tracker nav items and routes.
- v0.4: summarizer system prompt and model selection from the UI.

## 9. Open questions
None.
