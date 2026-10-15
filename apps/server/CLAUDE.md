# apps/server

Express API for Mnemosyne. It owns the job store, the worker that runs jobs one at a time, the clients for yt-dlp, ffmpeg and whisper-server, and the formatters that render transcripts. The root `CLAUDE.md` covers the workflow, precedence, cross-app rules, git and secrets; this file does not repeat them.

The relevant ADRs are 0003–0009, 0012, 0014 and 0015 in `docs/decisions/`. Read the ones a task lists before changing behaviour they describe. If a task conflicts with an ADR, stop and report it; don't pick one.

## Stack

- Node 24 LTS, ESM, TypeScript `strict`.
- Express 5, Zod.
- pnpm workspaces. Shared contracts come from `@mnemosyne/shared`.
- Vitest and Supertest.
- `tsc` builds `src/` to `dist/`, and production runs `node dist/src/server.js`. In development, `tsx` runs the source directly.
- External tools: `yt-dlp` and `ffmpeg` on the PATH, whisper-server over HTTP.

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

Parsed once with Zod in `config.ts`; nothing else reads `process.env`.

- `PORT`: default `3100`.
- `WHISPER_URL`: `http://localhost:8178` natively, `http://host.docker.internal:8178` in Docker.
- `WORK_DIR`: where downloaded and converted audio lives during a job; default the OS temp directory.
- `DATA_DIR`: where `mnemosyne.db` (the SQLite job store) lives; default `<OS temp dir>/mnemosyne-data`.
- `WHISPER_MODEL`: label stored as the transcript's `model` (whisper-server doesn't report it); default `large-v3-turbo`.
- `ANTHROPIC_API_KEY`: required; the Claude key used to summarize transcripts. Lives in `.env` only.
- `VAULT_PATH`: required; the Obsidian vault folder. Notes are written to `<VAULT_PATH>/Mnemosyne/`. It must exist and be writable at startup, or the server exits with a message.
- `SUMMARY_TIMEOUT_MS`: timeout of one summary request; default `300000`.
- `REVIEW_TTL_HOURS`: hours a job in review or with a failed summary is kept before deletion; default `24`.
- `WEB_DIR`: folder with the built web app; leave empty in development (Vite serves it). When set, Express serves it, with an `index.html` fallback for paths without an extension.

## Folder structure

```
src/
  server.ts          boot only: load config → start worker → listen
  app.ts             builds the Express app and mounts routes and the error middleware; tests import this, not server.ts
  config.ts          env parsed with Zod
  shutdown.ts        signal handling: stop the worker, close the server, exit; with a timeout
  errors.ts          typed errors and the error middleware
  routes/            <name>.routes.ts: an Express Router wiring paths to controller functions, nothing else
  controllers/       <name>.controller.ts: HTTP only (parse the request with Zod, call a service, send the response)
  services/          <name>.service.ts: business rules and job state changes
  repositories/      <name>.repository.ts: the in-memory job store, and nothing else
  clients/           ytDlp.client.ts, ffmpeg.client.ts, whisperServer.client.ts: one external tool each
  worker/            worker.ts, runJob.ts: takes the next queued job and runs it through the clients
  formatters/        markdown.formatter.ts, srt.formatter.ts, txt.formatter.ts: pure transcript → string
```

## Layers

The order is routes → controllers → services → repositories, and every request goes through all four.

- **Routes** map a method and path to a controller function. They hold no logic, validation or try/catch.
- **Controllers** read `params`, `query` and `body`, validate them with a Zod schema, call one service function, and send the response with an explicit status code. They never touch the job store, a client or the worker.
- **Services** hold the business rules, change job state, call repositories and formatters, and throw typed errors.
- **Repositories** hold and query the in-memory job store and nothing else. The store is a module-level `Map`; jobs are lost on restart (ADR 0006).
- **Clients** wrap one external tool each: run the command or make the HTTP call, parse the output with Zod, return typed data, and throw on failure. They hold no job logic.
- **The worker** calls services and clients, never repositories. It processes one job at a time and moves it through `queued → downloading → converting → transcribing → summarizing → ready_for_review | summary_failed` (or `failed`) via services. A job found already `summarizing` runs only the summarize step.
- **Formatters** are pure functions with no I/O. Only services call them.
- Nothing imports `routes/` or `controllers/` except `app.ts`.
- The worker deletes a job's audio files when the job finishes, whether it succeeded or failed.
- The exceptions are `GET /api/health`, whose controller responds directly with no service or repository because it has no rules or data, and `web.routes.ts`, which serves the built web app from `WEB_DIR` with no controller.

## Errors

- Services throw typed errors from `errors.ts`:
  - `ValidationError` → 400
  - `NotFoundError` → 404
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

**Reference example**

```ts
// jobs.routes.ts
// Express
import { Router } from 'express'
// Controllers
import { createJob, getJob, downloadTranscript } from '../controllers/jobs.controller.js'

export const jobsRoutes = Router()

jobsRoutes.post( '/jobs', createJob )
jobsRoutes.get( '/jobs/:id', getJob )
jobsRoutes.get( '/jobs/:id/download', downloadTranscript )
```

```ts
// jobs.controller.ts
// Express
import { Request, Response } from 'express'
// Shared
import {
  CreateJobBody,
  CreateJobResponse,
  DownloadFormat,
  GetJobResponse,
} from '@mnemosyne/shared'
// Services
import { findJob, queueJob, renderTranscript } from '../services/jobs.service.js'

export const createJob = ( { body }: Request, res: Response< CreateJobResponse > ): void => {
  const { url } = CreateJobBody.parse( body )

  const job = queueJob( url )

  res
    .status( 202 )
    .location( `/api/jobs/${ job.id }` )
    .json( { job_id: job.id } )
}

export const getJob = ( { params }: Request, res: Response< GetJobResponse > ): void => {
  const job = findJob( String( params.id ) )

  res.status( 200 ).json( { job } )
}

export const downloadTranscript = ( { params, query }: Request, res: Response ): void => {
  const format = DownloadFormat.parse( query.format ?? 'md' )

  const { filename, contentType, body } = renderTranscript( String( params.id ), format )

  res
    .status( 200 )
    .type( contentType )
    .attachment( filename )
    .send( body )
}
```

```ts
// runJob.ts
// Packages
import { rm } from 'node:fs/promises'
import path from 'node:path'
// Shared
import { Transcript } from '@mnemosyne/shared'
// Services
import {
  completeJob,
  failJob,
  findJob,
  markStatus,
} from '../services/jobs.service.js'
// Clients
import { downloadAudio } from '../clients/ytDlp.client.js'
import { convertToWav } from '../clients/ffmpeg.client.js'
import { transcribeAudio } from '../clients/whisperServer.client.js'
// Config
import { config } from '../config.js'

const RETRY_DELAY_MS = 3000
const removeOptions = { recursive: true, force: true }

const downloadWithRetry = async (
  url: string,
  workDir: string,
): ReturnType< typeof downloadAudio > => {
  try {
    return await downloadAudio( url, workDir )
  } catch( error ) {
    if( !( error instanceof Error && error.message.includes( '403' ) ) ) {
      throw error
    }
  }

  await rm( workDir, removeOptions )
  await new Promise( ( resolve ) => setTimeout( resolve, RETRY_DELAY_MS ) )

  return downloadAudio( url, workDir )
}

export const runJob = async ( jobId: string ): Promise< void > => {
  const job = findJob( jobId )
  markStatus( jobId, 'downloading' )

  const workDir = path.join( config.workDir, jobId )

  try {
    const { audioPath, meta } = await downloadWithRetry( job.url, workDir )

    markStatus( jobId, 'converting' )
    const wavPath = await convertToWav( audioPath )

    markStatus( jobId, 'transcribing' )
    const segments = await transcribeAudio( wavPath, config.whisperUrl )

    const transcript = Transcript.parse( {
      meta: {
        ...meta,
        transcribed_at: new Date().toISOString(),
        model: config.whisperModel,
      },
      segments,
    } )

    completeJob( jobId, transcript )
  } catch( error ) {
    failJob( jobId, error instanceof Error ? error.message : 'Unknown error' )
  } finally {
    try {
      await rm( workDir, removeOptions )
    } catch( cleanupError ) {
      console.error( `Could not remove work folder ${ workDir }`, cleanupError )
    }
  }
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
