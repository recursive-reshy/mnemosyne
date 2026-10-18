# Checkpoint C plan: Phase 6 (server articles)

Next: **Checkpoint C, task 6.1** (Plan cell ⬜). Checkpoints A and B are done. On approval: save this to `docs/v0.5.0/plans/checkpoint-c.md`, tick the Plan cell, commit `docs(plan): checkpoint C`, push, then start 6.1.

Read: PRD §6.1–6.4, TRD §4–5 and §7, ADRs 0030 and 0031, `tasks.md`, and the server code below. Only `apps/server` changes (no shared or web changes are planned; shared already has `ARTICLE_LIMITS`, `ArticleSource`, `SubmitPastedTextBody`, `CreateJobBody`). Gate after every task: server `test`, `lint`, `typecheck`; `build` at the end.

## Context
v0.5.0 lets Naresh submit an article URL, or paste its text, and get the same review note as a video. Checkpoint A put every job behind a `SourceDocument` and a `SourceAdapter` with only the video adapter. This checkpoint adds the article side on the server: fetching, extraction, Markdown conversion, the article adapter and pasted text, the jobs-service rules, the article summarizer, and the endpoints. The web follows in checkpoint D.

Standing rules: no test touches the network (local `http.createServer` on port 0, saved HTML fixtures); existing tests pass unchanged except the renames and fixture additions TRD §9 allows, each listed in the task's log line; new dependencies are added by the task that first uses them, pinned to the version current at that time (checked: `turndown` 7.2.4, `@types/turndown` 5.0.6, `@mozilla/readability` 0.6.0, `linkedom` 0.18.13).

## 6.1 `clients/http.client.ts`
- **Tests first** (`http.client.test.ts`, local server on port 0): body and `finalUrl` on 200; follows redirects by hand and reports the final URL; fails past 5 redirects (`RedirectError`) and on a redirect to a non-http(s) protocol; sends `User-Agent: Mnemosyne/<version> (personal reader)` and the `Accept` header; passes `If-None-Match`/`If-Modified-Since` and returns `304` with an empty body plus the validators; stops reading past `maxBytes` (`TooLargeError`), both for a long body and for one with no Content-Length; aborts on `timeoutMs` (`UnreachableError`, using a server that never answers and a short timeout, no fake timers needed); decodes the charset from `Content-Type` (ISO-8859-1 body) and falls back to UTF-8 for a missing or unknown one; maps 401/402/403 to `HttpStatusError` "The page needs a login or is paywalled", other 4xx/5xx to "The site answered <status>"; a refused connection is `UnreachableError` "Couldn't reach the site".
- **Code:** `fetchResource( url, { accept, maxBytes, timeoutMs, etag?, lastModified? } )` on Node's `fetch` with `redirect: 'manual'`, a stream reader with a byte counter and an `AbortController`, `TextDecoder` for the charset; the five typed errors in the same file (messages are the PRD texts, so `failJob` shows them as they are).
- **Version string:** `config.ts` gains `appVersion`, found by walking up from `import.meta.url` to the nearest `package.json` (it differs between `src/` and `dist/src/`); falls back to `dev`. Test in `config.test.ts`. (Nothing else reads the version; this keeps `process.env` out of the client.)
- Commit `feat(6.1): HTTP client`.

## 6.2 `sources/htmlToMarkdown.ts`
- Add `turndown` and `@types/turndown` (the task that first uses them).
- **Tests first** (`htmlToMarkdown.test.ts`, fixture strings): ATX headings, `-` bullets, fenced code, `*` emphasis, links kept with absolute hrefs untouched; `img`, `picture`, `figure`, `table`, `iframe`, `script`, `style`, `svg`, `video`, `audio`, `form`, `button` removed; a `figcaption` kept as its own paragraph; blockquote kept; three or more newlines collapsed to two and the result trimmed; empty input gives an empty string.
- **Code:** a configured `TurndownService` plus the removal rules from TRD §4.4, exported as `htmlToMarkdown( html )`.
- Commit `feat(6.2): HTML to Markdown`.

## 6.3 `sources/extractArticle.ts`
- Add `@mozilla/readability` and `linkedom`.
- **Fixtures** (`src/test-support/articles/*.html`, hand-trimmed, no network): a blog post, a Medium-style post, a Substack post, a page with almost no text, a page with relative links and `<base>`-less head. Each is realistic enough to exercise Readability (nav, footer, share buttons, a long article body of more than 500 characters).
- **Tests first** (`extractArticle.test.ts`): per fixture, the title, author (`byline`), site name, `published` cut to `YYYY-MM-DD`, Markdown containing the headings and paragraphs and none of the nav or footer text; relative links come out absolute against the page URL (the `<base>` rule); a page with almost no text throws "Not an article page"; a body over `maxChars` throws "Article is too long to summarize (<n> characters, limit 300,000)"; a missing published date gives `null`; the title falls back to `<title>`, then the hostname; the site falls back to the hostname. `fetchArticle( url )` tests use the 6.1 local server: HTML is extracted, a non-HTML content type gives "Not an article page", a 403 gives the paywall message, a 5 MB overrun gives the too-large message.
- **Code:** `parseHTML` from linkedom, the `<base href>` injected into `<head>` before Readability runs, `new Readability( document ).parse()`, `htmlToMarkdown( article.content )`, the length rules and meta rules from TRD §4.3.
- **Risk (TRD says stop and ask):** if Readability can't run on linkedom for a fixture, I stop and ask before switching to jsdom (a new ADR). A second known snag: Readability resolves relative links through `document.baseURI`, which linkedom may not derive from `<base>`; if so I set it explicitly on the document (and say so in the log) rather than rewriting links afterwards.
- Commit `feat(6.3): article extraction`.

## 6.4 `sources/text.ts`, `sources/article.adapter.ts`, `adapterFor( 'article' )`
- **Tests first:** `text.test.ts` for `articleFromText( { url, text, title?, origin, author?, site?, published? } )`: the given title wins; else the first Markdown heading (any level, markup stripped); else the first non-empty line cut to 120 characters; else the URL hostname; `origin`, `author`, `site`, `published` pass through (null when absent); `fetched_at` is now; the result parses as an `ArticleSource`. `article.adapter.test.ts` (mock `fetchArticle`): marks `fetching`, returns the article document with origin `fetched`, and a fetch error propagates with its message. `sources/index.test.ts`: the "no article adapter yet" test is replaced by one that expects the article adapter.
- **Code:** as TRD §4.1.
- Commit `feat(6.4): article adapter and pasted text documents`.

## 6.5 Jobs service
- **Tests first** in `jobs.service.test.ts` and `runJob.test.ts`:
  - `queueJob( body )`: detection picks `source_type`; `source_type` in the body overrides it; `text` builds the document with `articleFromText` (origin `pasted`), stores it, sets the title and the status `summarizing`, `queued` otherwise; model and profile validated as before; `feed_id` taken from an optional second argument (used by feeds later, not by the API).
  - `markStatus`: video `queued → downloading → converting → transcribing`; article `queued → fetching`; the wrong step for the type is a `ConflictError`.
  - `completeAcquisition`: video document from `transcribing`, article document from `fetching`; other combinations `ConflictError`.
  - `submitPastedText( id, { text, title? } )`: only for an article job in `failed`; builds the document (origin `pasted`), clears `error`, moves to `summarizing`, keeps profile and model; other states and video jobs `ConflictError`; unknown id `NotFoundError`.
  - `recoverInterruptedJobs` fails `fetching` jobs too (repository `markInterruptedJobs` list).
  - `renderTranscript` for articles: `md` is `# <title>\n\n<source URL>\n\n<markdown>` and `srt`/`txt` throw `ConflictError( 'Only Markdown is available for articles' )`; the filename comes from the title.
  - `runJob` runs an article job end to end with a mocked `fetchArticle`: `fetching` → `summarizing`, a fetch error fails the job with its message, a pasted-text job (already `summarizing`) goes straight to `summarizeJob`.
- **Signature change:** `queueJob( url, options )` becomes `queueJob( body: CreateJobBody, extra? )`, as TRD §4.5 says. That touches the existing call sites in tests (`queueJob( url )` → `queueJob( { url } )`, about 40 mechanical edits across the service, worker, route and summarize tests); each file is listed in the log line. No behaviour of an existing test changes.
- Commit `feat(6.5): jobs service for articles and pasted text`.

## 6.6 Summarizer for articles
- **Tests first:**
  - `prompts.test.ts`: `LOCKED_INSTRUCTIONS_VIDEO` (text unchanged, renamed) and `LOCKED_INSTRUCTIONS_ARTICLE` equal to the exact TRD §5.1 text; `buildSystemPrompt( guidance, kind )` picks by kind and wraps `<guidance>` as before.
  - `claude.client.test.ts` (mocked SDK, as today): `summarizeSource` for a video behaves as `summarizeTranscript` did (renamed); for an article the system prompt is the article one, the user message is `# <title>\n\n<markdown>`, the output format is the article schema (`overview`, `key_points` strings, `quotes` strings, `tags`), and the result is tagged `{ kind: 'article', … }`; error mapping and usage unchanged.
  - `summary.cleanup.test.ts`: article tags cleaned as for video; quotes kept only when `normalizeForQuote( quote )` is a substring of `normalizeForQuote( markdown )` (cases: curly and straight quotes, `*`/`_`/backticks stripped, a link's text kept without its URL, whitespace collapsed, a rewritten quote dropped); key points kept as they are.
  - `summary.formatter.test.ts`: article output is `## Summary`, `## Key points` with `- <point>`, `## Notable quotes` with `> "<quote>"`, no stamps, empty sections left out; video output unchanged.
  - `summarizeJob.test.ts`: an article job is summarized through `summarizeSource` with the article kind and ends `ready_for_review` with article front-matter; this replaces the temporary "Article summaries are not supported yet" test from 4.1.
  - `settings.service.test.ts` and the settings route test: `getLockedInstructions()` returns `{ video, article }` and `GET /api/settings` returns both real texts (replacing the placeholder from 2.3).
- **Code:** as TRD §5. `summarizeTranscript` is renamed `summarizeSource( { document, model, guidance } )`, and the existing fixtures that build summaries gain `kind: 'video'` (TRD §9 allows the rename and fixture additions).
- Commit `feat(6.6): article summaries`.

## 6.7 Endpoints
- **Tests first** (Supertest through `app.ts`, each status):
  - `POST /api/jobs`: accepts `source_type`, `text`, `title`; a YouTube URL stays a video; an article URL becomes an article job (202); `text` with a video, `text` shorter than 200 or longer than 300,000 characters, a bad `source_type` all 400.
  - `POST /api/jobs/:id/text`: 200 `{ job }` for a failed article job (status `summarizing`, `error` null); 400 bad body; 404 unknown id; 409 for a video job or a non-failed article job.
  - `GET /api/jobs/:id/download?format=srt|txt` for an article: 409 with the message; `md` works.
  - `PATCH /api/settings` with `feed_check_interval_minutes`: stored and returned by `GET`; a value off the list 400; `GET` falls back to 60. (This finishes the "accepted but not stored" stand-in from 2.3.)
  - The old 404/409/400 cases keep passing unchanged.
- **Code:** controllers parse with the shared schemas and call the services; a new route `POST /api/jobs/:id/text`; `updateSettings` stores the interval.
- Commit `feat(6.7): article and pasted-text endpoints`.

## Checkpoint end
`pnpm build` for the server; update the "Layers" and folder lines in `apps/server/CLAUDE.md` for the new clients and sources (the full server doc update is in 8.5, but anything this checkpoint makes wrong is fixed here). No web changes, so no screenshots or browser tests. I'll report commit hashes per task, server `test`/`lint`/`typecheck`/`build` results, and a short real-world check: the server run on a scratch database against a local test page (a small local HTTP server serving one of the fixtures) with a dummy Claude key, showing the job reach `summarizing` with the fetched Markdown stored; the actual Claude call is not made (no key, no network). No ADR is expected unless 6.3 forces the jsdom switch.

## Risks and decisions to confirm
1. **`queueJob` signature** changes per TRD §4.5; the existing tests that call it are edited mechanically.
2. **Readability on linkedom** (including `baseURI`): stop and ask if it can't work, as the TRD says.
3. **Version lookup** for the User-Agent adds `appVersion` to `config.ts`.
4. **No real article or Claude call** is made in this checkpoint; the first real check is task 10.3 with Naresh.
