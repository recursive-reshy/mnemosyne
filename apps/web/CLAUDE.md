# apps/web

React UI for Mnemosyne: submit a video or article URL (or paste an article's text), follow the job, review the note, subscribe to feeds. Screens only: all data and rules live in the server. The root `CLAUDE.md` covers the workflow, precedence, cross-app rules, git and secrets; this file does not repeat them. The server's style rules in `apps/server/CLAUDE.md` apply here too unless this file says otherwise.

The relevant ADRs are 0004, 0006, 0008, 0009, 0011, 0013, 0015, 0019, 0020, 0021, 0022, 0023, 0024, 0025, 0027, 0028, 0029, 0032, 0033 and 0034. Read the ones a task lists.

## Stack

- Vite, React, TypeScript `strict`, ESM.
- Vitest, React Testing Library, user-event, jest-dom, jsdom. Vitest browser mode with Playwright (Chromium and WebKit) for behaviour that needs a real DOM (ADR 0033).
- TanStack Query for server state and React Router for `/`, `/jobs/:id` and `/settings` (ADR 0013).
- Material UI (`@mui/material`, Emotion, `@mui/icons-material`, `@mui/x-tree-view`) is the only UI library, themed from `src/theme.ts` (ADR 0024). `@mdxeditor/editor` is the note editor (ADR 0019; round-trip rules in ADRs 0023 and 0026; see "Note editor" below).
- Shared contracts come from `@mnemosyne/shared`.

Don't add a dependency without it being approved first. Ask instead.

## Commands

- `pnpm dev`: Vite dev server on port 5173. It proxies `/api` to `http://localhost:3100` (the server must be running).
- `pnpm test`: Vitest, the jsdom `unit` project only.
- `pnpm test:browser`: the `browser` project, `*.browser.test.tsx` in headless Chromium and WebKit. Install them once with `pnpm exec playwright install chromium webkit`. Part of every web task's gate, with `test`, `lint` and `typecheck`.
- `pnpm lint`: ESLint check only. Never `--fix`.
- `pnpm typecheck`: `tsc -b`.
- `pnpm build`: `tsc -b && vite build`, output in `dist/`.

## Folder structure

```
src/
  main.tsx          mounts <App /> inside the MUI theme (ThemeProvider, CssBaseline), the query client provider and BrowserRouter
  theme.ts          the one MUI theme: CSS variables, light and dark colour schemes, radius, font, repeated component overrides
  App.tsx           the routes inside AppShell: `/` → HomePage, `/jobs/:id` → JobPage, `/settings` → SettingsPage
  api/              <name>.api.ts: fetch wrappers; parse responses with shared schemas
  expiry.ts         pure display helpers sit next to main.tsx as small camelCase modules (expiry.ts, later timestamp.ts)
  queryClient.ts    createQueryClient(): the app's TanStack Query defaults (no retries, no refetch on focus)
  hooks/            use<Name>.ts: state and effects, built on TanStack Query; queryKeys.ts holds the cache keys; one hook per data concern (jobs, source, settings, models, prompt profiles, feeds, the feed inbox, the Gmail account and labels); useAutosaveDraft keeps the review draft on the server
  components/       <Name>/index.ts, <Name>.tsx, <Name>.test.tsx: one folder per component (no CSS files). Route components: `HomePage`, `JobPage`; `AppShell` and `NavDrawer` are the navigation shell; `ReviewScreen` is the review layout `JobPage` shows for `ready_for_review` and `summary_failed`. Feature groups: the submit form (`SubmitForm`, `SourceTypeSwitch`, `PasteSection`, `PastedTextFields`, `SummaryOptions`), review (`SourcePane`, `NoteEditor`, `PropertiesPanel`, `NoteDestination`, `RegenerateDialog`, `SummaryInfo`), Settings (`SettingsPage`, `SummarizerDefaults`, `PromptProfiles`, `LockedInstructions`, `FeedSettings`, `GmailSettings`), Gmail sources (ADR 0035: `GmailSources` holds the list and its dialogs; `GmailSourceList`, the Add, Edit and Delete dialogs sharing `GmailMatchFields`, `GmailNewsletterFields` and `GmailPreviewSummary`; `gmailMatch.ts` turns the form's match draft into the shared `GmailMatch`), and feeds (ADR 0032: `FeedList`, the Add, Edit and Delete dialogs sharing `FeedFields`, `FeedInbox` with `SummarizeItemsDialog`, `FeedChip`, `JobHeading`); `ConfirmDialog` is the shared confirm
  test-support/     shared test helpers and fixtures
```

## Layers

- **Components** render props and call handlers. No `fetch`, no timers, no URL handling (only the route components and the navigation shell touch the router). They may import the URL builders from `api/` (such as `downloadUrl`), never the functions that fetch.
- **Hooks** hold state and effects, and call `api/`. Review drafts live on the server (ADR 0020), saved by `useAutosaveDraft`; browser storage is only for per-viewer conveniences, reached only from hooks, always inside try/catch, and the app works without it.
- **`api/`** is the only code that calls `fetch`. It uses relative `/api/...` URLs, parses every response with a schema from `@mnemosyne/shared`, and throws an `Error` with a readable message on a non-2xx response (using the server's `{ error }` body when it parses) or a network failure.
- **Navigation shell** (`NavDrawer`) may render router `Link`s and read `useLocation` to mark the current item (ADR 0025). Its footer holds the Settings item (a utility entry, not a module, so not in `NAV_ITEMS`) above the colour-mode control. Nothing else in it reads or changes the URL.
- **Route components** (`HomePage`, `JobPage`) own the URL: they read it with `useParams` and change it with `useNavigate` / `Navigate`. Nothing else reads or writes `window.location` or the router, except `useGmailRedirectNotice`: the server's OAuth callback returns to `/settings?gmail=…`, and that hook reads the query once and removes it with `replace` (ADR 0035).
- Downloads are `<a href="/api/jobs/:id/download?format=…">` links.

## Note editor

`NoteEditor` wraps MDXEditor. Styled by MUI and `theme.ts` only; its own stylesheet import is the one CSS import in the app.
- **Toolbar:** the Rich text / Source mode toggle (`ModeToggle`, MUI) plus `FormattingToolbar`, shown in rich-text mode only. `FormattingToolbar` uses MDXEditor's own components as they come (they own focus and state): undo and redo, block type (paragraph, Heading 1 to 3, quote), bold, italic, bulleted and numbered lists, create link. No underline (Markdown has none, so it would be written as HTML), no check lists, code, tables or images. Before adding a control, add what it writes to the fixtures in `test-support/noteFixtures.ts` and check the round trip (ADR 0023); if MDXEditor writes something else, stop and ask.
- **Dark mode:** MDXEditor is themed by the `dark-theme` class. `NoteEditor` keeps its `className` constant (`"noteEditor"`) and toggles `dark-theme` by hand with `classList` (an effect on the resolved colour scheme, on the editor root and on `.mdxeditor-popup-container`). Never make `className` depend on the colour scheme: a changing `className` makes MDXEditor recreate its popup container and orphans the Radix popups (the block type dropdown stops opening). The mapping of MDXEditor's colour variables to the MUI palette lives in `theme.ts` (`MuiCssBaseline` overrides on `.noteEditor`), because popups render under `<body>`, outside the editor wrapper.
- **Tests:** toggles are `radio` items with `aria-checked` (Bold is named "Remove bold" while on), the block type is a combobox named "Block type", Create link is a button, and Undo and Redo are named "Undo ..." / "Redo ...". jsdom needs the stubs in `test-support/setup.ts` for Radix Select and the link dialog. jsdom cannot show the block type's label; check that in the browser. After a colour switch, test that the dropdown and the link dialog still open and sit in the popup container.

## Accessibility

- Every input has a `<label>`. Use real `<button>` and `<a>` elements.
- Progress is announced with `role="status"`; errors use `role="alert"`.
- Never rely on colour alone to show a state.

## Tests

- Test-first, as in the root `CLAUDE.md`. Tests sit next to their source as `.test.ts` / `.test.tsx`.
- Query by role, label or text, as a user would. Never by class name or test id unless nothing else works.
- Tests import Testing Library from `@testing-library/react` and `userEvent` from `@testing-library/user-event`; matchers such as `toBeInTheDocument` come from the setup file.
- Use `userEvent` for interaction. Use Vitest fake timers for the polling hook; the test setup hands TanStack results to React from a microtask so fake timers don't stall them. Never use real sleeps.
- Mock at the boundary: component tests pass props; hook tests mock the `api/` module and render through `renderHookWithClient` (component tests that use queries or the router use `renderWithClient`, which also takes a `route` and returns `location()`), both from `test-support/renderWithClient.tsx` with a fresh client; `api/` tests stub `fetch` with `vi.stubGlobal`. No test touches the network or a real server.
- Render components that use MUI themed features, queries or the router with `renderWithClient` (it wraps the same theme as `main.tsx`). For a narrow window or a dark OS, call `mockMatchMedia` from `test-support/matchMedia.ts` (the setup file installs a wide, light default).
- MUI quirks to know: `Alert` puts `role="alert"` on its root and the text in an inner element, so query by role and check `textContent`; a disabled MUI `Button` has `pointer-events: none`, so where a test clicks a disabled button, give it `pointerEvents: 'auto'` in `sx`; a tree item's name comes from its descendants unless it has an `aria-label`.
- **Browser tests** (`*.browser.test.tsx`, ADR 0033) are only for behaviour that depends on a real DOM: selection, focus, scrolling, layout. Everything else stays in jsdom. They import `userEvent` from `vitest/browser` (real input events), mock the `api/` modules and hooks like the jsdom tests, run in both browsers, and are typechecked by `tsconfig.browser.json` (the `vitest/browser` matcher types clash with jest-dom's, so `tsconfig.app.json` excludes them). Never use real sleeps; wait with `expect.poll` or `vi.waitFor`. Failure screenshots go to `.vitest/` (git-ignored).
- After a UI slice, run the dev server with the server behind it and look at the page in a browser (screenshot), then say what you saw. Passing unit tests don't prove a page looks right.

## Style

The server's rules in `apps/server/CLAUDE.md` apply here unchanged (spacing, 100-character lines, no semicolons, single quotes, no `any`, erasable syntax only, import-group comments, no comments that restate the code). These are the differences and additions for React.

**Files and naming**
- Each component lives in its own PascalCase folder with its files named after it: `components/SubmitForm/SubmitForm.tsx`, `SubmitForm.test.tsx`, and an `index.ts` containing only `export { SubmitForm } from './SubmitForm'` (a named re-export, never `export *`). Other code imports the component through its folder (`./components/SubmitForm`). Files inside the folder import each other directly, never through their own `index.ts`. Only component folders have an `index.ts`. Everything else is camelCase with a role suffix (`jobs.api.ts`, `useJob.ts`).
- One exported component per file, named exports only, no default exports. A tiny private helper component may share its parent's file.
- Components are nouns (`JobProgress`); hooks start with `use`; event-handler props start with `on` (`onSubmit`); the handlers inside a component start with `handle` (`handleSubmit`).
- Booleans read as questions: `isSubmitting`, `hasError`. No abbreviations beyond `id` and `url`.
- Imports have no file extensions. Keep a relative import within its own folder or one level up; use the `#src/*` alias whenever a relative import would climb two or more levels. The alias is a tsconfig `paths` entry in `tsconfig.app.json`, with the matching resolution in `vite.config.ts`; Vite resolves it, so unlike the server no `package.json` `imports` field is used.

**Components**
- Components and hooks are function declarations with explicit types: `export function SubmitForm( { onSubmit }: SubmitFormProps ): ReactElement`. Every other function (handlers, helpers, `api/` functions, functions inside effects) is a `const` arrow function. A function used once whose body is a single expression is written inline at its call site. ESLint enforces this. Props types are local and named `<Component>Props`. Destructure props in the parameter list.
- A component does one job. Split it when it has two, or when part of its JSX has its own state or its own test.
- Keep state minimal and derive the rest during render. If a value can be computed from props or state, don't store it, and don't use an effect to compute it.
- Use early returns for loading, empty and error states instead of nested ternaries.
- Constants and lookup maps (such as the stage labels) live at module level, outside the component.
- Don't use `useMemo`, `useCallback` or `memo` unless a measured problem needs them.
- Don't add abstractions for one use: no wrapper component, custom hook or utility that is called from a single place and has no state or logic of its own. Do things inline.

**Size**
- A source file stays under about 150 lines. When one grows past that, split it by responsibility (a part of the UI, or the logic from the rendering), not into arbitrary pieces.
- A component function stays short enough to read without scrolling; if the JSX needs comments to explain its sections, those sections should be components.
- Test files are exempt from the line limit but should still be split by behaviour when they sprawl.

**JSX and CSS**
- JSX attributes use double quotes. Inner spaces in JSX braces: `value={ url }`.
- Style with MUI components and their props first, then `sx`. An `sx` object longer than a few lines goes in a module-level `const` in the same file (named `<THING>_SX`).
- Styling used in more than one component goes in a theme `components` override in `theme.ts`; don't add `styled()` components unless a style is shared across files.
- Spacing uses the theme scale (`sx={ { p: 2 } }`), not hard-coded rem values. Colours come from the palette (`'text.secondary'`, `'divider'`), not hex values.
- No `.css` files or CSS modules. The only stylesheet import is MDXEditor's own (`@mdxeditor/editor/style.css`, in `NoteEditor`).
- Import MUI by path (`@mui/material/Button`, `@mui/icons-material/Close`) so unused parts are tree-shaken.
- Status labels shown to the user live in one typed `as const` map, not scattered in JSX.