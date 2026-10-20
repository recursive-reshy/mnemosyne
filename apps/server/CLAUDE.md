# apps/server

Express API for Mnemosyne. It owns the SQLite job store, the worker that runs jobs one at a time (transcribe, then summarize), the sweeper that deletes expired jobs, the clients for yt-dlp, ffmpeg, whisper-server, Claude and the Obsidian vault, and the formatters that render transcripts, summaries and notes. The root `CLAUDE.md` covers the workflow, precedence, cross-app rules, git and secrets; this file does not repeat them.

The relevant ADRs are 0003–0009, 0012, 0014, 0015, 0020–0022, 0023 and 0027–0032 in `docs/decisions/`. Read the ones a task lists before changing behaviour they describe. If a task conflicts with an ADR, stop and report it; don't pick one.

## Stack

- Node 24 LTS, ESM, TypeScript `strict`.
- Express 5, Zod.
- pnpm workspaces. Shared contracts come from `@mnemosyne/shared`.
- Vitest and Supertest.
- `tsc` builds `src/` to `dist/`, and production runs `node dist/src/server.js`. In development, `tsx` runs the source directly.
- better-sqlite3 for the job store, `@anthropic-ai/sdk` for summaries.
- External tools: `yt-dlp` and `ffmpeg` on the PATH, whisper-server over HTTP, the Claude API, and the vault folder on disk.

Don't add a dependency without it being approved first. Ask instead.

## Commands

- `pnpm test`: Vitest, unit tests only.
- `pnpm test:integration`: tests that call the real yt-dlp, ffmpeg and whisper-server. Never part of `pnpm test`.
- `pnpm lint`: ESLint check only. Never run it with `--fix`.
- `pnpm typecheck`: `tsc --noEmit`.
- `pnpm build`: `tsc --build tsconfig.build.json`.
- `pnpm dev`: `tsx watch --conditions=development --env-file=.env src/server.ts`.

If a script above doesn't exist yet, add it as part of the task that first needs it.

## Environment

Parsed once with Zod in `config.ts`; nothing else reads `process.env`. `.env.example` lists every variable with its default. What isn't obvious from there:

- `WHISPER_URL` is `http://host.docker.internal:8178` in Docker. `DATA_DIR` is `/data` (a named volume) and `VAULT_PATH` is `/vault` (bind-mounted from `VAULT_HOST_PATH`) in Docker.
- `ANTHROPIC_API_KEY` and `VAULT_PATH` are required; the vault must exist and be writable at startup, or the server exits with a message. The key lives in `.env` only.
- `DEFAULT_NOTE_FOLDER` is validated at startup with the shared folder rules and created if missing.
- Gmail (ADR 0035) is optional: `config.gmail` is `null` unless `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` (32 bytes, base64) are all set. A key that is set but isn't 32 bytes stops startup. `GOOGLE_REDIRECT_URI` defaults to the callback on `PORT`.
- `WEB_DIR`: empty in development (Vite serves the web app). When set, Express serves it, with an `index.html` fallback for paths without an extension.

## Folder structure

```
src/
  server.ts          boot only: load config → check the vault → open the store → recover interrupted jobs → start sweeper, worker and feed poller → listen
  app.ts             builds the Express app and mounts routes and the error middleware; tests import this, not server.ts
  config.ts          env parsed with Zod
  shutdown.ts        signal handling: stop the sweeper, the worker, the feed poller and the server, close the store, exit; with a timeout
  errors.ts          typed errors and the error middleware
  routes/            <name>.routes.ts: an Express Router wiring paths to controller functions, nothing else
  controllers/       <name>.controller.ts: HTTP only (parse the request with Zod, call a service, send the response)
  services/          <name>.service.ts: business rules and job state changes (jobs, vault, settings, prompts, models, feeds, feedInbox, gmail, gmailSources: the sources, their sync and checks)
  repositories/      <name>.repository.ts: the SQLite database and nothing else; database.ts holds the connection and the migrations; jobStore, summaryRuns, settings, promptProfiles, feeds, feedItems, and for Gmail (ADRs 0035, 0037): gmailAccount, gmailSources, gmailMessages, postings, extractionRuns
  gmail/             Gmail intake (ADR 0035): tokenCipher (AES-256-GCM for the refresh token), auth (OAuth consent, the cached Gmail client, `withGmail` and the reconnect rule), gmail.client (labels, message ids by label or search, messages; the only module that calls the Gmail API, always through `withGmail`) and parseMessage (a Gmail message to subject, sender, date and bodies; pure)
  clients/           <name>.client.ts: one external tool each (ytDlp, ffmpeg, whisperServer, claude, anthropicModels, vault, http); the vault client resolves every folder inside the vault (`resolveFolder`)
  sources/           adapters that turn a job into a `SourceDocument` (ADR 0030): video and article adapters, article extraction (ADR 0031), feed parsing and discovery (ADR 0032), pasted text, `adapterFor( sourceType )`; they use clients and report steps through the context, never touch repositories
  worker/            worker, runJob, summarizeJob, sweeper, feedPoller: runs the next runnable job; deletes expired jobs; checks due feeds every minute, one pass at a time
  summarizer/        pure constants and functions: locked prompts, seeded profiles, prices
  formatters/        markdown, srt, txt, summary, note: pure data → string; summary.cleanup.ts filters the model's output
```

## Layers

The order is routes → controllers → services → repositories, and every request goes through all four.

- **Routes** map a method and path to a controller function. They hold no logic, validation or try/catch.
- **Controllers** read `params`, `query` and `body`, validate them with a Zod schema, call one service function, and send the response with an explicit status code. They never touch the job store, a client or the worker.
- **Services** hold the business rules, change job state, call repositories and formatters, and throw typed errors.
- **Repositories** hold and query the SQLite database (better-sqlite3, ADR 0012) behind synchronous free functions, and nothing else. `database.ts` owns the connection and the migrations (`openDatabase` / `closeDatabase` from `server.ts` and `shutdown.ts`, `getDatabase` from the other repositories); tests open `':memory:'` through `test-support/database.setup.ts`.
- **Clients** wrap one external tool each: run the command or make the HTTP call, parse the output with Zod, return typed data, and throw on failure. They hold no job logic.
- **The sweeper** calls one service function on a timer and deletes expired jobs; it never touches repositories.
- **The worker** calls services and clients, never repositories. It processes one job at a time and moves it through `queued → downloading → converting → transcribing → summarizing → ready_for_review | summary_failed` for a video, `queued → fetching → summarizing → …` for an article (or `failed`) via services. A job found already `summarizing` runs only the summarize step. Regenerating a summary is the one other way into `summarizing`: `ready_for_review → summarizing` (ADR 0029). Each summary attempt records a row in `summary_runs`, through the jobs service.
- **Formatters** are pure functions with no I/O. Only services call them.
- Nothing imports `routes/` or `controllers/` except `app.ts`.
- The worker deletes a job's audio files when the job finishes, whether it succeeded or failed.
- The exceptions are `GET /api/health`, whose controller responds directly with no service or repository because it has no rules or data, and `web.routes.ts`, which serves the built web app from `WEB_DIR` with no controller.

## Errors

- Services throw typed errors from `errors.ts`:
  - `ValidationError` → 400
  - `NotFoundError` → 404
  - `BadGatewayError` → 502, a site that can't be read while previewing or adding a feed
  - `ConflictError` → 409, e.g. downloading a transcript before the job is `ready_for_review` or `summary_failed`
- One error middleware in `errors.ts` maps those errors to status codes, and maps a `ZodError` from a controller's parse to 400.
- Anything else is logged with the error and returns 500 `{ error: 'Internal Server Error' }`.
- Express 5 forwards rejected promises to that middleware, so controllers don't wrap their bodies in try/catch.
- A failing client marks the job `failed` with a readable `error` message; it never crashes the worker.
- Catch an error only where you handle it differently, and never swallow one silently.

## TypeScript style

**Spacing**
- Put a space inside every non-empty `( )`, `[ ]`, `{ }` and `< >`, for example `Promise< void >`. Empty brackets stay tight.
- No space between a keyword and its parenthesis: `if( … )`, `for( … )`, `catch( error )`.
- No semicolons.
- Leave one blank line between top-level definitions, and a blank line between the reading, the work and the response inside a function.
- There is no formatter. ESLint enforces style as a check only.

**Line length and breaking**
- Lines stay within 100 characters.
- When a function call or a function signature would pass 100 characters, put each argument or parameter on its own line, with a trailing comma.
- Break an import across lines when it names more than three things, one name per line, with a trailing comma.

**Quotes**
- Single quotes in TypeScript.
- Double quotes in HTML and JSON.
- Template literals instead of concatenation.

**Types**
- Every exported function has explicit parameter and return types. No `any`; use `unknown` and narrow it.
- Use erasable syntax only: no `enum`, no `namespace`, no parameter properties. For a fixed set of values, use a string-literal union or an `as const` object.
- Structured values are Zod schemas with `z.infer` types. Request input and external tool output are parsed with Zod, never cast with `as`.
- Request bodies, response shapes, `Job`, `JobStatus`, `Segment`, `Transcript` and `DownloadFormat` live in `@mnemosyne/shared`, because the web app imports them too. Controllers import them and never define them locally. Only schemas no other package uses, such as a route param or a client's raw output, may be local.
- Annotate the exported app as `Express` and every exported router as `Router`. Without it, declaration emit fails under pnpm (TS2883).

**Naming**
- Meaningful names; no abbreviations beyond `id` and `url`.
- Files and folders are camelCase with a role suffix: `jobs.routes.ts`, `jobs.controller.ts`, `jobs.service.ts`, `jobStore.repository.ts`, `whisperServer.client.ts`, `markdown.formatter.ts`.
- Functions and variables are camelCase; types and schemas are PascalCase.
- Fields that mirror a wire contract keep the contract's casing, so there's no mapping layer.

**Imports**
- Group imports under a one-line comment naming the group, in this order:
  1. `// Packages`, with the package name instead when one group is a single package (e.g. `// Express`)
  2. `// Shared`
  3. `// Services`, `// Repositories`, `// Clients` and so on, by layer
- Relative and aliased imports use the `.js` extension, as `tsc` emits them; TypeScript and tsx resolve it to the `.ts` source.
- Use the `#src/*` alias whenever a relative import would climb two or more levels (`../../`). Relative imports are fine within a folder or one level up. The alias is a Node subpath import in `package.json`: the `development` condition points at `./src/*` (set by `tsx --conditions=development` and `customConditions` in `tsconfig.json`), and `default` points at `./dist/src/*`. Don't add `paths` aliases to `tsconfig.json`: Node doesn't read them at runtime.
- `@mnemosyne/shared` is imported by its package name, never by a relative path.

**Code shape**
- Destructure what a handler uses from the request in its parameter list: `( { params, body }: Request, res: Response )`.
- Functions are arrow functions assigned to a `const`, exported or not. A `function` declaration is allowed only when it must be hoisted, with an `eslint-disable-next-line func-style` comment saying why. A function used once whose body is a single expression is written inline. ESLint enforces this with `func-style`.
- No unnecessary abstractions; do things inline when they can be done inline.
- No comments or JSDoc that restate the code. Comment only on why. Import-group comments are the exception.

**Reference example** (`feeds.routes.ts` and part of `feeds.controller.ts`)

```ts
// Express
import { Router } from 'express'
// Controllers
import { addFeed, getFeeds } from '../controllers/feeds.controller.js'

export const feedsRoutes: Router = Router()

feedsRoutes.get( '/feeds', getFeeds )
feedsRoutes.post( '/feeds', addFeed )
```

```ts
// Express
import { Request, Response } from 'express'
// Shared
import { CreateFeedBody, FeedResponse, ListFeedsResponse } from '@mnemosyne/shared'
// Services
import { createFeed, listFeeds } from '../services/feeds.service.js'

export const getFeeds = ( _req: Request, res: Response< ListFeedsResponse > ): void => {
  res.status( 200 ).json( { feeds: listFeeds() } )
}

export const addFeed = async (
  { body }: Request,
  res: Response< FeedResponse >,
): Promise< void > => {
  const feed = await createFeed( CreateFeedBody.parse( body ) )

  res.status( 201 ).json( { feed } )
}
```

## Test-first workflow

The root `CLAUDE.md` makes TDD the rule. This is how it runs here:

1. **Write the task's tests first.** The approved checkpoint plan lists them. Start with the outermost behaviour it names:
   - an endpoint is tested through `app.ts`;
   - a rule or state change is tested at the service;
   - a client is tested against mocked tool output;
   - a formatter is tested with a fixed transcript in, exact string out.
2. **Run them and watch them fail for the right reason:** a failed assertion, not an import or syntax error. Then write the least code that makes them pass, working down the layers.
3. **Refactor only while the tests are green.** Don't add behaviour no test asks for. If you find you need some, add a test for it first.
4. **A bug fix starts with a test that reproduces the bug.**
5. **Never change or delete an existing test to make code pass.** If you think a test is wrong, stop and say so.

## Tests

- Tests sit next to their source with the same name plus `.test.ts`, e.g. `jobs.service.test.ts`.
- Routes and controllers are tested through `app.ts` with Supertest, including the status code for each typed error. Never start a real server in a test.
- External tools are mocked with Vitest (`vi.mock`): service and worker tests mock the client modules; client tests mock `node:child_process` or `fetch` and assert on the command or request they build and how they parse the output.
- Unit tests never run yt-dlp, ffmpeg or whisper-server, and never touch the network.
- Integration tests that use the real tools are named `*.integration.test.ts` and run only through `pnpm test:integration`.
- Reset the job store between tests so no test depends on another's jobs.
- Use Vitest fake timers for anything time-based. Never use real sleeps.
