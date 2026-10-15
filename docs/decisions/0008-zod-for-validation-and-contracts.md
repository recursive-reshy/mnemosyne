# 0008. Zod for validation and contracts

- Status: Accepted
- Date: 2026-10-14

## Context
Request bodies, query parameters, environment variables and external tool output (yt-dlp's JSON metadata, whisper-server's response) all arrive as untrusted data. The server and web app also need one shared definition of shapes like `Job` and `Transcript`.

## Decision
- **Zod** defines every structured value. TypeScript types are inferred with `z.infer`, never written separately.
- Contracts used by both apps (request and response bodies, `Job`, `JobStatus`, `Segment`, `Transcript`, `DownloadFormat`) live in `packages/shared`.
- Controllers parse request input with Zod; `config.ts` parses the environment; clients parse tool output. Nothing is cast with `as`.
- A `ZodError` from request parsing maps to HTTP 400 in the error middleware.

## Consequences
- One source of truth for each shape, checked at runtime and compile time.
- Broken tool output (e.g. after a yt-dlp change) fails loudly at the client instead of deep in the app.
- Adds one runtime dependency to the server, shared package and web app.

## Alternatives considered
- **Hand-written types plus manual checks:** no runtime guarantee, and types drift from the checks.
- **Valibot / ArkType:** smaller or faster, but Zod is the familiar choice and matches the My Team codebase.
