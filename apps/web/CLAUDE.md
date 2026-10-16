# apps/web

React UI for Mnemosyne: submit a video URL, follow the job, download the transcript. Screens only: all data and rules live in the server. The root `CLAUDE.md` covers the workflow, precedence, cross-app rules, git and secrets; this file does not repeat them. The server's style rules in `apps/server/CLAUDE.md` apply here too unless this file says otherwise.

The relevant ADRs are 0004, 0006, 0008, 0009, 0011, 0013, 0015, 0020 and 0021. Read the ones a task lists.

## Stack

- Vite, React, TypeScript `strict`, ESM.
- Vitest, React Testing Library, user-event, jest-dom, jsdom.
- TanStack Query for server state and React Router for `/` and `/jobs/:id` (ADR 0013).
- Plain CSS modules. No UI library.
- Shared contracts come from `@mnemosyne/shared`.

Don't add a dependency without it being approved first. Ask instead.

## Commands

- `pnpm dev`: Vite dev server on port 5173. It proxies `/api` to `http://localhost:3100` (the server must be running).
- `pnpm test`: Vitest.
- `pnpm lint`: ESLint check only. Never `--fix`.
- `pnpm typecheck`: `tsc -b`.
- `pnpm build`: `tsc -b && vite build`, output in `dist/`.

## Folder structure

```
src/
  main.tsx          mounts <App /> inside the query client provider and BrowserRouter
  global.css        tokens (colours, spacing) for light and dark mode, base element styles; the only non-module stylesheet
  App.tsx           page chrome and the routes: `/` → HomePage, `/jobs/:id` → JobPage
  api/              <name>.api.ts: fetch wrappers; parse responses with shared schemas
  expiry.ts         pure display helpers sit next to main.tsx as small camelCase modules (expiry.ts, later timestamp.ts)
  queryClient.ts    createQueryClient(): the app's TanStack Query defaults (no retries, no refetch on focus)
  hooks/            use<Name>.ts: state and effects, built on TanStack Query; queryKeys.ts holds the cache keys; useAutosaveDraft keeps the review draft on the server
  components/       <Name>/index.ts, <Name>.tsx, <Name>.module.css, <Name>.test.tsx: one folder per component; HomePage and JobPage are the route components; ReviewScreen is the review layout JobPage shows for `ready_for_review` and `summary_failed`
  test-support/     shared test helpers and fixtures
```

## Layers

- **Components** render props and call handlers. No `fetch`, no timers, no URL handling (only the route components touch the router). They may import the URL builders from `api/` (such as `downloadUrl`), never the functions that fetch.
- **Hooks** hold state and effects, and call `api/`. Review drafts live on the server (ADR 0020), saved by `useAutosaveDraft`; browser storage is only for per-viewer conveniences, reached only from hooks, always inside try/catch, and the app works without it.
- **`api/`** is the only code that calls `fetch`. It uses relative `/api/...` URLs, parses every response with a schema from `@mnemosyne/shared`, and throws an `Error` with a readable message on a non-2xx response (using the server's `{ error }` body when it parses) or a network failure.
- **Route components** (`HomePage`, `JobPage`) own the URL: they read it with `useParams` and change it with `useNavigate` / `Navigate`. Nothing else reads or writes `window.location` or the router.
- Downloads are `<a href="/api/jobs/:id/download?format=…">` links.

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
- After a UI slice, run the dev server with the server behind it and look at the page in a browser (screenshot), then say what you saw. Passing unit tests don't prove a page looks right.

## Style

The server's rules in `apps/server/CLAUDE.md` apply here unchanged (spacing, 100-character lines, no semicolons, single quotes, no `any`, erasable syntax only, import-group comments, no comments that restate the code). These are the differences and additions for React.

**Files and naming**
- Each component lives in its own PascalCase folder with its files named after it: `components/SubmitForm/SubmitForm.tsx`, `SubmitForm.module.css`, `SubmitForm.test.tsx`, and an `index.ts` containing only `export { SubmitForm } from './SubmitForm'` (a named re-export, never `export *`). Other code imports the component through its folder (`./components/SubmitForm`). Files inside the folder import each other directly, never through their own `index.ts`. Only component folders have an `index.ts`. Everything else is camelCase with a role suffix (`jobs.api.ts`, `useJob.ts`).
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
- Each component's styles live in `<Name>.module.css` next to it. Class names are camelCase (`styles.submitButton`).
- Status labels shown to the user live in one typed `as const` map, not scattered in JSX.