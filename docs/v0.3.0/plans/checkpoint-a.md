# Checkpoint A plan: Phases 1–3 (kick-off, shared, server data)

## Context
v0.3.0 turns the draft into one Markdown string (ADR 0021) with a folder choice (ADR 0022). Checkpoint A lays the foundations with no user-visible change: docs kick-off, the shared note and folder modules, and the server data layer (migration 2, new `Job` fields). Old fields (`summary_markdown`, `suggested_tags`) stay until Phase 8. TDD per task (ADR 0007), one commit each, pushed. After each task run `pnpm test`, `lint`, `typecheck` in every touched folder (`packages/shared`, `apps/server`, and `apps/web` for 3.3).

ADRs 0019–0022 are all "Proposed" today; 1.1 flips 0019–0022 to Accepted.

## Points to confirm
1. **`yaml` and the 0.2.0 layout.** `yaml.stringify` won't give `tags: [a, b]` flow style plus `created: 2026-10-15` unquoted for free. Plan: build the document with `yaml`'s `Document` API (flow `Seq` for tags, `QUOTE_DOUBLE` scalars for title/source/channel/duration, plain `created`), and pin output against the existing `note.formatter.test.ts` expectations. Parsing uses `yaml.parse`. If the byte layout can't be matched, I'll stop and ask rather than hand-write it.
2. **Byte-identical round trip** means `parseNote` keeps the raw front-matter block and body as-is; `serializeNote( parseNote( x ) )` returns `x` when properties are unchanged. Plan: `parseNote` returns `ParsedNote` plus a hidden raw-front-matter cache is *not* used (keeps the TRD shape); instead `serializeNote` is deterministic and a test pins that notes produced by 0.2.0 / `serializeNote` round-trip exactly. Hand-edited YAML with different layout normalizes to the canonical layout (acceptable: server re-serializes on every draft update anyway). Tell me if you want a stricter guarantee.
3. **`formatNote` trims the body** and ends with one `\n`; `serializeNote` will do the same shape: `---\n<yaml>---\n\n<body>`. Body handling: `formatNote` (the wrapper) keeps `body.trim() + '\n'` so existing tests stay unchanged; `serializeNote` itself writes the body verbatim.
4. **Web fixture** (`apps/web/src/test-support/job.fixture.ts`) needs `note_markdown: null`, `target_folder: null` in 3.3 because the new `Job` fields are required. Fixture only; web tests/lint/typecheck run for that commit.

## Phase 1

### 1.1 Docs kick-off
- Files: `docs/README.md`, `docs/decisions/0016-local-drafts.md`, `0019`–`0022` (Status lines).
- No code, so no test. README: current version 0.3.0, v0.2.0 marked done, add 0019–0022 as Accepted, 0016 "Superseded by 0020" (index and file Status line).
- Tick 1.1 in `tasks.md`, log line, commit `docs(1.1): v0.3.0 kick-off`.

## Phase 2

### 2.1 `parseNote` / `serializeNote`
- Files: `packages/shared/package.json` (+ `yaml`), `src/note.ts`, `src/note.test.ts`, `src/index.ts`.
- Tests first (red: module missing): 0.2.0 fixture parses to expected properties and body; `serializeNote( parseNote( fixture ) ) === fixture`; layout pinned (key order title, source, channel, duration, created, tags; `tags: [mnemosyne, a]`; quoted strings with `\"` escapes; plain `created`); missing front-matter and invalid YAML throw `NoteParseError`; body with `[[wikilinks]]`, `*` bullets, `---` rules in the body kept byte-for-byte; missing/non-string required keys throw.
- Code: `NoteProperties` / `ParsedNote` schemas (Zod), `NoteParseError` class, `parseNote`, `serializeNote`.

### 2.2 `applyLockedProperties`
- Files: `src/note.ts`, `src/note.test.ts`.
- Tests first: overwrites source/channel/duration/created; `mnemosyne` first and not repeated; tags pass through `normalizeTag`, empties dropped, deduped, order kept; title/body untouched; input not mutated.
- Code: `LockedProperties` type + function using `normalizeTag` from `tags.ts`.

### 2.3 Folder paths
- Files: `src/folders.ts`, `src/folders.test.ts`, `src/index.ts`.
- Tests first: `isValidFolderName` rejects each of `/ \ : * ? " < > |`, control chars, leading `.`, `.`, `..`, empty, >100 chars; accepts spaces, unicode, 100 chars. `parseFolderPath`: `''` → `[]`; `'A/B'` → `['A','B']`; rejects leading/trailing `/`, empty segments, `..`, dot-folders.
- Code: both functions; `parseFolderPath` throws `Error` with the failing segment named.

### 2.4 `formatNote` over `serializeNote`
- Files: `apps/server/src/formatters/note.formatter.ts` (+ tests unchanged).
- Red/green: existing `note.formatter.test.ts` is the safety net and must stay green untouched; first run shows nothing red, so the "red" is 2.1's pinned layout test. Code: build `ParsedNote` from input (tags via `applyLockedProperties`-style ordering), return `serializeNote`.
- Leaves `frontmatter.ts` `quoted` in place (transcript formatter still uses it).

## Phase 3

### 3.1 Migration runner
- Files: `apps/server/src/repositories/jobStore.repository.ts`, `jobStore.repository.test.ts`.
- Tests first: a function migration appended in a test is run with the open DB; string migrations still `exec`'d; `user_version` bumps; a throwing function migration rolls back everything and `user_version` stays. Make the migrations list injectable for the test (internal `runMigrations( db, migrations )` exported for tests; `jobStoreMigrations` type becomes `Array< string | ( db ) => void >`).
- Code: runner branches on `typeof migration === 'string'`. Migration 1 unchanged.

### 3.2 Migration 2
- Files: same repository file; test via a DB built to `user_version = 1`.
- Tests first: rows in `ready_for_review`, `summary_failed`, `saved` before; after open: `note_markdown` backfilled only for `ready_for_review` (title, tags with `mnemosyne` first, meta source/channel/duration, today's date as `created`, body = old `summary_markdown`); other rows null; `target_folder` null; `user_version = 2`; backfill throw rolls back.
- Code: function migration: two `ALTER TABLE … ADD COLUMN`, then backfill using `serializeNote` and `Transcript` parse for `meta`. If a review row has no transcript/title, fall back to the stored title and skip meta fields as empty strings (noted in test).
- "Today" comes from `Date` (same as `saveJob` today); tests use fake timers.

### 3.3 `Job` DTO and repository
- Files: `packages/shared/src/job.ts` + `job.test.ts`; `jobStore.repository.ts` (`JobRow`, insert/update/toRow); `services/jobs.service.ts` (`toPublicJob`, `queueJob`, `completeSummary`); `worker/summarizeJob.ts`; test files for each; `apps/web/src/test-support/job.fixture.ts`.
- Tests first: shared `Job` requires `note_markdown` and `target_folder` (nullable); repository round-trips both; `queueJob` returns nulls; `completeSummary` stores `note_markdown` via `serializeNote` (title from `job.title`, tags from summary, locked fields from `transcript.meta`, `created` = today, body from `formatSummary`) and still writes old fields; `summarizeJob` test updated for the new signature if it changes.
- Code: `completeSummary( id, summaryMarkdown, suggestedTags )` builds the note itself from the stored transcript (no signature change). `toPublicJob` maps the two new fields.

## Verification
- `pnpm test`, `pnpm lint`, `pnpm typecheck` in `packages/shared`, `apps/server`, `apps/web` after 3.3 (shared and server after each earlier task).
- Run migration 2 against a copy of a real 0.2.0 DB is left to checkpoint E's manual list.
- Checkpoint report: tasks with commit hashes, results per folder, ADR changes (0019–0022 Accepted; 0016 superseded; none change the TRD), and anything deferred.
