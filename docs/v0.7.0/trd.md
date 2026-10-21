# Mnemosyne v0.7.0 — Technical Requirements

Companion to `docs/v0.7.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.6.0 code at commit `b404bf5`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet. In code, a proposed link is a **link suggestion**; running the agent on a job is **linking**.

## 1. Changes at a glance
- **New app `apps/agent`** (ADR 0042): a stateless Python 3.14 / FastAPI "vault agent service" with read-only vault tools and one endpoint group, `/v1/link`. **Naresh creates the project scaffold** (§2.1) before checkpoint A; tasks start from it.
- **Contract** (ADR 0043): Pydantic models in the service are the source; a committed JSON Schema export; golden examples; a hand-written Zod mirror in `packages/shared/src/agent.ts`.
- **Shared:** `agent.ts`; `wikilinks.ts` (insertion and stale logic, ADR 0045); `JobStatus` gains `linking`; `Job` gains `link_state`, `link_error`, `link_usage`; `Settings` gains the linking keys; link-suggestion API schemas; `PromptProfile` gains nothing visible (the linker profile is never listed).
- **Server:** migration 7 (`prompt_profiles.purpose`, the seeded linker profile, `link_runs`, `link_suggestions`, `jobs.link_state` / `link_error`); an agent HTTP client; `linkJob` in the worker after summarizing; link-suggestion routes; Settings additions; the linker prompt through the existing profile routes.
- **Web:** linking step in `JobProgress`; a **Suggested links** panel on the review screen with accept, reject, Add to Related, Accept all, Reject all, Retry / Re-run / Run linking; a **Linking** section in Settings.
- **Docker:** a second Compose service, `agent`, with no host port, the vault mounted `:ro` and a read-only filesystem (§8).
- **New dependencies** (and only these):
  - agent: `fastapi`, `uvicorn`, `anthropic` (runtime); `pytest`, `ruff`, `pyright` (dev). Added by Naresh's scaffold. `httpx` is required by FastAPI's `TestClient`; add it as a dev dependency with `uv add --dev httpx` in the task that first uses `TestClient`, if the scaffold doesn't already pull it in.
  - server and web: none.
  - Check each package's real API against this TRD before using it; if it differs in a way that changes the design, stop and ask.
- **Environment:** `ANTHROPIC_API_KEY` (existing, now also passed to the agent), `AGENT_SECRET` (new, required for linking), `AGENT_URL` (new, server; default `http://localhost:8100`), `VAULT_PATH` (new, agent; Compose sets `/vault`).

## 2. Agent service (`apps/agent`, new)

### 2.1 Scaffold (done by Naresh) and tooling
Naresh runs, before checkpoint A:
```bash
cd apps
uv init --package --python 3.14 --name mnemosyne-agent agent   # creates src/mnemosyne_agent; keeps the existing CLAUDE.md
cd agent
uv add fastapi uvicorn anthropic
uv add --dev pytest ruff pyright
```
and adds `.venv/` and `__pycache__/` to the root `.gitignore`. Task 1.2 checks the scaffold and adds what it doesn't contain:
- `apps/agent/package.json` (`"name": "@mnemosyne/agent"`, `"private": true`, version 0.6.0 until task 8.2) with scripts `test` → `uv run pytest`, `lint` → `uv run ruff check`, `typecheck` → `uv run pyright`, `dev` → `uv run uvicorn mnemosyne_agent.main:app --reload --port 8100`. No `build` script.
- `pyproject.toml` tool sections:
  - `[tool.ruff]` `target-version = "py314"`, `line-length = 120`; `[tool.ruff.lint]` `select = [ "E4", "E7", "E9", "F", "B", "UP", "N", "SIM" ]`. Never `I`, `E1`, `E2`, `E3`, `W` or `COM` (the house style contradicts them). No `[tool.ruff.format]`; the formatter is never run.
  - `[tool.pyright]` `typeCheckingMode = "strict"`, `pythonVersion = "3.14"`, `include = [ "src", "tests" ]`.
  - `[tool.pytest.ini_options]` `testpaths = [ "tests" ]`, `markers = [ "docker: needs a Docker daemon" ]`, `addopts = "-m 'not docker'"`.
- `apps/agent/CLAUDE.md` (already written with these docs).

Layout (filled in by the tasks):
```
apps/agent/
  pyproject.toml  uv.lock  package.json  CLAUDE.md  Dockerfile  .dockerignore
  schema/
    link_contract.json            # committed export (§3.2)
    examples/{valid,invalid}/*.json
  src/mnemosyne_agent/
    main.py          # create_app(), routes, auth dependency
    config.py        # Settings (pydantic BaseModel read from the environment)
    claude.py        # the Claude boundary (§2.5)
    contract/        # Pydantic request/response models, export.py
    vault/           # notes.py, search.py, links.py, paths.py
    linker/          # instructions.py, tools.py, loop.py, checks.py
  tests/
    fixtures/vault/  # a small fixture vault
```
The pnpm workspace already globs `apps/*`; the `package.json` makes `pnpm -r test|lint|typecheck` include the agent.

### 2.2 Config (`config.py`)
A Pydantic model read once from the environment in `create_app()` and passed down (no module-level instance mutated at runtime):

| Variable / field | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | required | never logged |
| `AGENT_SECRET` | required, at least 32 characters | never logged |
| `VAULT_PATH` | required | must be an existing directory |
| `max_turns` | 12 | ADR 0044 |
| `max_tool_calls` | 24 | |
| `max_output_tokens` | 4096 | per Messages call |
| `run_timeout_seconds` | 90 | whole run |
| `max_suggestions` | 8 | |
| `list_notes_limit` | 500 | |
| `search_hits_limit` | 20 | |
| `search_snippet_chars` | 200 | |
| `read_note_chars` | 8000 | |
| `link_targets_limit` | 500 | |

Limits are fields with defaults, overridable by `AGENT_<NAME>` variables but not set in Compose. A missing or invalid required variable stops startup with a message naming it.

### 2.3 App, auth and health (`main.py`)
- `create_app( settings, claude )` builds the FastAPI app; tests pass a fake `claude`. The module-level `app` for uvicorn calls it with the real ones.
- Auth: a dependency on every `/v1/*` route reads `Authorization: Bearer <secret>` and compares with `hmac.compare_digest`. Missing or wrong → HTTP 401 `{ "detail": "unauthorized" }`. This is the only non-200 response besides health failures.
- `GET /health` (no auth) → `200 { "status": "ok", "vault": "readable" }` when `VAULT_PATH` can be listed, else `503 { "status": "error", "vault": "unreadable" }`.
- FastAPI's request validation handler is replaced for `/v1/link` so a body that fails validation returns HTTP 200 with a `failed` response, `reason` naming the error count and first field (§3.1). No 422 ever reaches Express.
- OpenAPI docs routes are disabled (`docs_url = None`, `redoc_url = None`); the schema is exported by `contract/export.py`, not served.
- Logging: one line per request (route, outcome, duration, tool calls, tokens). Never the note body, the guidance, the secret or the key.

### 2.4 Vault tools (`vault/`)
All functions take the vault root from settings and are pure reads.
- **Paths (`paths.py`):** `resolve_note( root, relative )` resolves the path, rejects anything outside `root` (including through symlinks) and anything not ending in `.md`; returns a typed failure, never raises for user input. Folders `.obsidian/`, `.trash/` and any dot-folder are skipped everywhere.
- **Notes (`notes.py`):** `list_notes()` walks the vault and returns `{ path, title, tags }` per note, sorted by path. `title` is the front-matter `title` if present, else the file stem. `tags` from front-matter `tags` (list or comma string). Front-matter is parsed with a small YAML-subset reader for `title` and `tags` only (no new dependency); malformed front-matter yields the stem and no tags. Capped at `list_notes_limit` with `omitted` count. `read_note( path )` returns `{ path, title, content, truncated }`, content capped at `read_note_chars`.
- **Search (`search.py`):** `search_vault( query )` splits the query into terms (whitespace; quoted phrases kept together), matches case-insensitively line by line, and returns hits `{ path, line, snippet }` for lines containing every term, ordered by number of matching lines per note, then path. Snippets centre on the first term, `search_snippet_chars` long. Capped at `search_hits_limit` with `omitted`.
- **Link targets (`links.py`):** `list_link_targets()` parses every note for `[[target]]`, `[[target|alias]]`, `[[target#heading]]`, `[[target#heading|alias]]` (target = text before `#` or `|`, trimmed), skipping fenced and inline code and `![[embeds]]`. Groups case-insensitively, keeping the most-used casing, and returns `{ target, uses, has_note }`, where `has_note` is true when a note title or stem matches case-insensitively. Sorted by `uses` descending, then target. Capped at `link_targets_limit`. The same parser is reused by the post-checks (§2.7).

### 2.5 The Claude boundary (`claude.py`)
- A `Protocol` `ClaudeClient` with one async method, `create_message( request: MessageRequest ) -> MessageReply`, where both are Pydantic models covering what the loop uses (system blocks with `cache_control`, tools, messages, model, max tokens; reply content blocks, stop reason, usage including `cache_read_input_tokens` and `cache_creation_input_tokens`).
- `AnthropicClaude` implements it with `anthropic.AsyncAnthropic`. It is the only module that imports `anthropic`.
- Tests use a scripted fake that returns queued replies and records requests. No test calls the API (house rule).

### 2.6 The linker loop (`linker/`)
- **Instructions (`instructions.py`):** the locked instructions as one constant. They state: the agent's job (propose links from this note to related notes and concepts in the vault), the tools and when to use them, reuse-before-invent, the naming rule for new concepts (Title Case, singular, short noun phrase), the anchor rule (an exact phrase from the note body, never from front-matter, headings, quotes, timestamps or existing links; null for a Related link), at most `max_suggestions`, one-line reasons, and that the run ends only by calling `submit_suggestions`. The editable guidance (§6.6) is appended after them under a `## Guidance` heading. The note is sent in the first user message (title, tags, folder, body), never in the system prompt, so the system prompt and tools stay cacheable.
- **Tools (`tools.py`):** JSON schemas for `list_notes`, `search_vault { query }`, `read_note { path }`, `list_link_targets`, and `submit_suggestions { suggestions: [ { target, anchor, reason } ] }`. The model doesn't send a kind (computed, §2.7). Tool results are JSON text.
- **Loop (`loop.py`):** `run_linker( request, settings, claude ) -> LinkResponse`.
  1. Build the system prompt (instructions + guidance) with `cache_control` on its last block and on the last tool definition.
  2. Call Claude. Accumulate usage on every call, including failed ones.
  3. Execute each `tool_use` block (vault tools), append results, count tool calls.
  4. On `submit_suggestions`, validate its input with Pydantic. Invalid → one corrective turn (a `tool_result` with `is_error: true` naming the errors); invalid again → `failed`, "Suggestions failed validation twice (N errors)".
  5. A reply with no tool call and no submit → one corrective turn asking for `submit_suggestions`; again → `failed`.
  6. Stop with `failed` when `max_turns` or `max_tool_calls` is reached ("Stopped after 24 tool calls (limit 24)"), or `run_timeout_seconds` passes (`asyncio.timeout`; "Timed out after 90 s").
  7. Anthropic API errors (`anthropic.APIError` subclasses) are caught in `claude.py`'s caller and returned as `failed` with the status and message; rate limits are not retried inside the service (Express's Retry linking covers it).
- **Outcome:** a `StrEnum` `LinkOutcome` (`linked`, `failed`). `linked` may carry zero suggestions.

### 2.7 Post-checks (`checks.py`)
Run on the submitted suggestions, in this order, before responding:
1. Drop empty targets; trim; collapse inner whitespace.
2. Compute `kind` against the vault: case-insensitive match to a note title or stem → `existing_note` (target rewritten to the title); else to an existing link target → `existing_concept` (rewritten to its kept casing); else `new_concept`.
3. Drop a target equal (case-insensitively) to the note's own title.
4. Anchor: if not null and not found verbatim (case-sensitive substring) in the request body, set it to null (it becomes a Related suggestion).
5. Drop duplicate targets (case-insensitive), keeping the first.
6. Keep the first `max_suggestions`.

Where in the note an anchor may be placed is not checked here; that is `findAnchor` in `packages/shared` (§4.3).

### 2.8 Endpoints
- `POST /v1/link` → `LinkResponse` (§3.1), always HTTP 200 once authorized.
- `GET /v1/link/instructions` → `{ "instructions": str }`, the locked instructions with `max_suggestions` filled in.
- `GET /health` (§2.3).

## 3. Contract (ADR 0043)

### 3.1 Pydantic models (`contract/`, the source of truth)
```text
LinkNote        { title: str (1..300), tags: list[str] (max 50), folder: str | None, body: str (1..200_000) }
LinkRequest     { note: LinkNote, model: str (min 1), guidance: str (max 20_000) }
SuggestionKind  StrEnum: existing_note | existing_concept | new_concept
LinkSuggestion  { target: str (1..200), kind: SuggestionKind, anchor: str | None, reason: str (1..300) }
LinkUsage       { input_tokens: int, output_tokens: int, cache_read_input_tokens: int,
                  cache_creation_input_tokens: int, tool_calls: int, turns: int }
LinkOutcome     StrEnum: linked | failed
LinkResponse    { outcome: LinkOutcome, reason: str | None, suggestions: list[LinkSuggestion], usage: LinkUsage }
                  # failed → reason set, suggestions []; linked → reason None
InstructionsResponse { instructions: str }
```
All keys are required in `LinkResponse` (nullable ones included), so Express always gets the same shape. `usage` counts zero when the request never reached Claude (invalid body).

### 3.2 Export and examples
- `uv run python -m mnemosyne_agent.contract.export` writes `schema/link_contract.json`: one object with `$defs` for every model above, from `model_json_schema( mode = "serialization" )` (requests in `mode = "validation"`), keys sorted, two-space indent, trailing newline.
- `tests/contract/test_export.py` regenerates in memory and fails if it differs from the file.
- Examples: `schema/examples/valid/` holds at least `link-request.json`, `link-request-empty-vault.json`, `link-response-linked.json`, `link-response-linked-empty.json`, `link-response-failed.json`, `instructions-response.json`; `schema/examples/invalid/` holds at least a request with an empty body, a request with no model, a response with an unknown kind, and a failed response without `reason`. Each file is `{ "schema": "<ModelName>", "value": … }`.
- `tests/contract/test_examples.py` validates every example with the named Pydantic model; `packages/shared/src/agent.examples.test.ts` does the same with the Zod schema of the same name (reading the files relative to the repo root). Both fail on an unknown `schema` name.

### 3.3 Zod mirror (`packages/shared/src/agent.ts`, new)
`LinkNote`, `LinkRequest`, `SuggestionKind`, `LinkSuggestion`, `LinkUsage`, `LinkOutcome`, `LinkResponse`, `InstructionsResponse`, matching §3.1 field for field (snake_case keys, same limits; `LinkResponse` refined so `failed` has a reason and no suggestions). Exported from `index.ts`.

## 4. Shared contracts (`packages/shared`), other changes

### 4.1 Jobs (`job.ts`)
- `JobStatus` gains `'linking'` (after `summarizing`).
- `LinkState = 'off' | 'pending' | 'linked' | 'failed'`.
- `Job` gains `link_state: LinkState | null` (null before summarizing finishes), `link_error: string | null`, `link_usage: LinkUsageSummary | null`.
- `LinkRun = { model, prompt_version: int, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, tool_calls, cost_usd: number | null, outcome: 'succeeded' | 'failed', created_at }`; `LinkUsageSummary = { last_run: LinkRun, run_count, total_input_tokens, total_output_tokens, total_cost_usd: number | null }` (mirrors `SummaryUsage`).

### 4.2 Link suggestions (`linkSuggestions.ts`, new)
```ts
LinkSuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'superseded'
StoredLinkSuggestion = { id: uuid, job_id: uuid, position: int, target: string, kind: SuggestionKind,
                         anchor: string | null, reason: string, status: LinkSuggestionStatus,
                         decided_at: iso | null }
ListLinkSuggestionsResponse = { suggestions: StoredLinkSuggestion[] }      // pending, accepted, rejected; not superseded; by position
AcceptLinkSuggestionsBody  = { ids: uuid[].min(1).max(50), note_markdown: string }
RejectLinkSuggestionsBody  = { ids: uuid[].min(1).max(50) }
RunLinkingBody             = { note_markdown?: string }                    // saved as a draft first when given
LinkSuggestionsResponse    = { job: Job, suggestions: StoredLinkSuggestion[] }
```

### 4.3 Wikilinks (`wikilinks.ts`, new, pure; ADR 0045)
- `findAnchor( markdown, anchor ): { start: number, end: number } | null` — the first occurrence of `anchor` in the note body that is case-sensitive exact, on word boundaries (Unicode letters and digits; `\p{L}\p{N}` on both sides), and not inside: the front-matter, an ATX heading line, a blockquote line, a fenced code block, inline code, `[[…]]`, or a Markdown link or image (`[text](url)`, `![alt](url)`, autolinks). Implemented by masking those regions, then searching the rest.
- `insertLink( markdown, suggestion: { target, anchor }, options?: { asRelated?: boolean } ): string`
  - If the body already contains a wikilink to `target` (case-insensitive, any alias or heading), return `markdown` unchanged.
  - With an anchor, not `asRelated`, and `findAnchor` finds it: replace that range with `[[target]]` when `anchor === target`, else `[[target|anchor]]`.
  - Otherwise: append `- [[target]]` to the list under a `## Related` heading (exact, case-sensitive, last one in the note), or add `\n## Related\n\n- [[target]]\n` at the end of the body (normalizing to one blank line before it and a single trailing newline).
- `isStale( markdown, suggestion ): boolean` — `anchor !== null && findAnchor( markdown, anchor ) === null`.
- `hasWikilink( markdown, target ): boolean` (used by `insertLink` and the panel to show "already linked").
- Tests cover every excluded region, word boundaries (`art` vs `start`), case-only differences (`[[Pricing Strategy|pricing strategy]]`), an existing `## Related`, a note without one, an already-linked target, front-matter untouched, and that the output round-trips through `parseNote`/`serializeNote` unchanged apart from the insertion.

### 4.4 Settings (`summarizer.ts`)
- `Settings` gains `linking_enabled: boolean`, `linking_model: string`, `linker_profile_id: uuid`.
- `UpdateSettingsBody` accepts `linking_enabled` and `linking_model` (validated with `assertKnownModel`); `linker_profile_id` is read-only. The refine message lists the new keys.
- `GetSettingsResponse` gains `linker_locked_instructions: string | null` (null when the agent service is unreachable) and `agent_status: 'ok' | 'unavailable' | 'not_configured'`.

Schema tests for each, as in 0.6.0.

## 5. Data (SQLite)

### 5.1 Migration 7 (a function migration, `addLinking`)
```sql
ALTER TABLE prompt_profiles ADD COLUMN purpose TEXT NOT NULL DEFAULT 'summary';
-- then, in code: insert the linker profile (purpose 'linker', name 'Linker', seed_key 'linker')
-- and its version 1 (source 'seed', guidance = DEFAULT_LINKER_GUIDANCE, §6.6)

CREATE TABLE link_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_input_tokens INTEGER,
  cache_creation_input_tokens INTEGER,
  tool_calls INTEGER,
  cost_usd REAL,
  outcome TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX link_runs_job ON link_runs ( job_id, id );

CREATE TABLE link_suggestions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_id INTEGER NOT NULL REFERENCES link_runs ( id ),
  position INTEGER NOT NULL,
  target TEXT NOT NULL,
  kind TEXT NOT NULL,
  anchor TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX link_suggestions_job ON link_suggestions ( job_id, status, position );

ALTER TABLE jobs ADD COLUMN link_state TEXT;
ALTER TABLE jobs ADD COLUMN link_error TEXT;
```
Settings keys `linking_enabled` and `linking_model` are not seeded (defaults in §6.6). The existing unique index on active profile names stays; the linker profile's name doesn't collide with a summary profile because summary profile listing and creation filter by purpose (§6.6), and creating a summary profile named "Linker" must still work, so the index becomes `ON prompt_profiles ( purpose, lower( name ) ) WHERE deleted_at IS NULL` (dropped and recreated in the migration).

Tested from version 6 (with a review job, two summary profiles and a summary run) and from empty.

### 5.2 Repositories (synchronous free functions on `getDatabase()`, as before)
- `promptProfiles.repository.ts`: `purpose` on rows; `listActiveProfiles( purpose )`; `findProfileBySeedKey( 'linker' )`.
- `linkRuns.repository.ts` (new): `insertLinkRun`, `listLinkRuns( jobId )`, `summarizeLinkUsage( jobId )`.
- `linkSuggestions.repository.ts` (new): `insertSuggestions( runId, jobId, suggestions )`, `listSuggestions( jobId )` (not superseded), `findSuggestions( jobId, ids )`, `setStatus( ids, status, decidedAt )`, `supersedePending( jobId )`, `deleteForJob( jobId )`.
- `jobStore.repository.ts`: `link_state`, `link_error`; `findNextRunnableJob` includes `'linking'`; `deleteJob` also deletes the job's link runs and suggestions (and summary runs stay as they are today).
- `apps/server/CLAUDE.md` repositories line updated.

## 6. Server

### 6.1 Config (`config.ts`)
- `AGENT_URL` (default `http://localhost:8100`), `AGENT_SECRET` (optional; at least 32 characters when set), `AGENT_TIMEOUT_MS` (default 120_000).
- `config.agent = { url, secret, timeoutMs } | null` — null when `AGENT_SECRET` is unset, which means linking is **not configured**: jobs skip linking (`link_state = 'off'`) and Settings says so.
- `.env.example` gains `AGENT_SECRET` (with `openssl rand -hex 32` in the comment), `AGENT_URL` and `VAULT_PATH` (for running the agent outside Docker).

### 6.2 Agent client (`clients/agent.client.ts`, new)
- `requestLinks( request: LinkRequest ): Promise< LinkResponse >` — `POST {url}/v1/link` with the bearer secret, a JSON body, and `AbortSignal.timeout( timeoutMs )`; parses the reply with the Zod `LinkResponse`.
- `fetchInstructions(): Promise< string >` and `checkHealth(): Promise< 'ok' | 'unavailable' >` (2-second timeout; health is cached for 30 seconds in memory to keep Settings cheap).
- Transport errors, timeouts, 401 and invalid replies throw `AgentError` with a plain message ("Agent service unreachable", "Agent service rejected the secret", "Agent service timed out after 120 s", "Agent service returned an invalid response"). A `failed` outcome is not an error; the caller handles it.
- Tests mock `fetch`, as the other client tests do.

### 6.3 Job flow (`services/jobs.service.ts`, `worker/linkJob.ts` new, `worker/runJob.ts`)
- `completeSummary` moves to `linking` (with `link_state = 'pending'`, `expires_at = null`) when linking is enabled in settings and `config.agent` is set; otherwise to `ready_for_review` with `link_state = 'off'`, as before.
- `runJob`: after summarizing, if the job is `linking`, `await linkJob( jobId )`. A job found in `linking` when picked (after a restart, or from Retry / Re-run) goes straight to `linkJob`.
- `linkJob( jobId )`:
  1. Read the job's note (`parseNote` of `note_markdown`), its target folder (or the default folder), the linking model (`settings.linking_model`) and the linker profile's current version.
  2. `requestLinks` with `{ note: { title, tags, folder, body }, model, guidance }`.
  3. Record a `link_runs` row (usage, `estimateCostUsd( model, input, output )`, outcome, error) for every attempt, including `AgentError` (no usage then).
  4. `linked` → insert the suggestions (`pending`), `completeLinking`: `ready_for_review`, `link_state = 'linked'`, `link_error = null`, `expires_at = expiryFromNow()`.
  5. `failed` or `AgentError` → `failLinking`: `ready_for_review`, `link_state = 'failed'`, `link_error = reason`, `expires_at = expiryFromNow()`. Never `failed` or `summary_failed`.
- `recoverInterruptedJobs` also moves `linking` jobs to `ready_for_review` with `link_state = 'failed'` and `link_error = 'Interrupted by restart'` (they are not re-run automatically).
- `regenerateSummary` supersedes pending suggestions; the regenerated summary then links again through the normal flow.
- `runLinking( id, body )` (Retry linking, Re-run linking and Run linking are the same operation): only from `ready_for_review` (else 409); refuses with 409 "Linking isn't configured" when `config.agent` is null; when `note_markdown` is given, saves it through `updateDraft` first; supersedes pending suggestions; moves to `linking` with `link_state = 'pending'`, `link_error = null`, `expires_at = null`. The worker picks it up.
- `acceptSuggestions( id, body )`: only `ready_for_review`; every id must be a `pending` suggestion of this job (else 409 naming the first that isn't); in one transaction: the draft update (same validation and locked properties as `updateDraft`, restarting the expiry) and `setStatus( ids, 'accepted' )`. Returns `LinkSuggestionsResponse`.
- `rejectSuggestions( id, body )`: same checks; `setStatus( ids, 'rejected' )`; doesn't touch the draft or the expiry.
- `saveJob` and `discardJob` leave suggestion rows alone (deleted with the job by the sweeper or `deleteJob`).
- `Job` assembly adds `link_usage` from `summarizeLinkUsage`, as `summary_usage` is built today.

### 6.4 Routes (`routes/jobs.routes.ts`, `controllers/jobs.controller.ts`)
- `GET  /api/jobs/:id/link-suggestions` → `ListLinkSuggestionsResponse`
- `POST /api/jobs/:id/link-suggestions/accept` (`AcceptLinkSuggestionsBody`) → `LinkSuggestionsResponse`
- `POST /api/jobs/:id/link-suggestions/reject` (`RejectLinkSuggestionsBody`) → `LinkSuggestionsResponse`
- `POST /api/jobs/:id/linking` (`RunLinkingBody`) → `{ job: Job }` (202)
`:id` validated as a uuid (400). Errors through the existing typed errors (400, 404, 409, 422).

### 6.5 Settings (`services/settings.service.ts`, `controllers/settings.controller.ts`)
- `linking_enabled`: stored value, else `true`.
- `linking_model`: stored value, else the newest model whose id contains `haiku` from `listModels()`, else `SHIPPED_DEFAULT_MODEL` (the same fallback rule as `extraction_model`).
- `linker_profile_id`: the seeded linker profile.
- `GET /api/settings` adds `linker_locked_instructions` (from `fetchInstructions`, null on `AgentError`) and `agent_status` (`not_configured` when `config.agent` is null, else `checkHealth()`). A down agent never fails the Settings request.

### 6.6 Linker prompt (`services/prompts.service.ts`, `promptProfiles` routes)
- `DEFAULT_LINKER_GUIDANCE` in `summarizer/prompts.ts` beside the summary defaults:
  > Link this note to what it is genuinely about, not to every noun it mentions. Prefer a few strong links over many weak ones. Link to existing notes first, then to existing concepts, and only then propose a new concept. Good concepts are ideas, methods, fields, tools, companies or people that are likely to come up again in other notes (for example Pricing Strategy, Customer Discovery, TypeScript). Avoid concepts that are too broad to be useful (Business, Technology) or too narrow to recur (a single statistic or anecdote). When the note discusses a business idea, link the market, the customer problem and the business model concepts it touches.
- `GET /api/prompt-profiles` and `POST /api/prompt-profiles` act on `purpose = 'summary'` only. `PATCH` (rename) and `DELETE` on the linker profile → 409 "The linker prompt can't be renamed or deleted". The versions, save version, restore and reset routes work on it unchanged. Choosing the linker profile as a summary profile (settings, regenerate, feed and Gmail source profile fields) → 400.
- `resolvePrompt` gains `resolveLinkerPrompt()` returning the current version.
- Reset restores `DEFAULT_LINKER_GUIDANCE` (the seed key `linker` maps to it, as the summary seed keys map to theirs).

## 7. Web

### 7.1 Hooks and API
- `api/linkSuggestions.api.ts`; `linkSuggestionKeys` in `queryKeys.ts`.
- `useLinkSuggestions( jobId, { enabled } )`: enabled when the job is `ready_for_review` and `link_state` is `linked`.
- `useAcceptLinkSuggestions`, `useRejectLinkSuggestions`, `useRunLinking`: on success they update the job and suggestion caches from the response (no refetch round-trip), as `useAutosaveDraft` does for drafts.
- `useJob` keeps polling while the status is `linking` (it already polls non-final statuses; add `linking` to that list).
- `useSettings` exposes the new fields; the linker prompt uses `usePromptVersions( settings.linker_profile_id )`.

### 7.2 Job progress (`JobProgress`)
A **Linking** step after Summarizing in both step lists, label "Linking…". Shown only when the job reaches it (jobs with `link_state = 'off'` show the 0.6.0 steps).

### 7.3 Review screen (`ReviewScreen`, new `LinkSuggestionsPanel`)
- The right-hand column gets tabs: **Suggested links (n pending)** and **Source** (the existing `SourcePane`). It opens on Suggested links when any are pending, else Source. Caret sync keeps working on the Source tab.
- `LinkSuggestionsPanel` lists suggestions by position. Each row: the target (`[[Target]]` in monospace), a kind chip (existing note: primary outlined; existing concept: default outlined; new concept: secondary filled, so new concepts stand out), the placement ("at "anchor"" or "Related"), a **Stale** chip when `isStale`, an "Already linked" note when `hasWikilink`, the reason, and actions: **Accept** (or **Add to Related** when stale or unanchored), **Reject**. Accepted and rejected rows collapse to a single line with an Undo-free status (decisions are final; Re-run linking gives new suggestions).
- **Accept** flow: cancel any pending autosave timer, read `editor.getMarkdown()`, `insertLink` (with `asRelated` when stale), `editor.setMarkdown( next )`, update the autosave hook's note to `next` without scheduling a save, then `useAcceptLinkSuggestions( { ids: [ id ], note_markdown: next } )`. On error, show it in the panel and leave the editor as it is (the next autosave stores the text; the suggestion stays pending).
- **Accept all**: the same, applying every pending suggestion in position order to one running string, then one request with all ids. **Reject all**: one request.
- Header actions: **Re-run linking** (when `link_state` is `linked`; confirms when pending suggestions exist) sends the current editor Markdown as `note_markdown`. When `link_state` is `failed`: an `Alert` with `link_error` and **Retry linking**. When `off` and the agent is configured: **Run linking**. When not configured: a short note linking to Settings.
- `SummaryInfo` shows linking usage under the summary's (model, tokens, cost or "tokens only").
- The editor stays editable throughout; the panel recomputes stale on every editor change (debounced 300 ms).

### 7.4 Settings (`SettingsPage`, new `LinkingSettings`)
A **Linking** section after Summarizer: the agent status (ok / unavailable with "Linking is skipped until it's back" / not configured with the setup hint), the **Link notes automatically** switch (`linking_enabled`), the **Linking model** select (same `useModels` list), the linker prompt with `PromptEditor` and `PromptHistory` on `linker_profile_id`, and `LockedInstructions` showing `linker_locked_instructions` (or "Unavailable while the agent service is down").

### 7.5 Not changed
`NoteEditor`, `wikilinkMarkdown.ts` and the round-trip tests stay as they are; the panel only uses the editor's existing `getMarkdown` / `setMarkdown`. Rendering wikilinks as chips in rich-text mode is KIV.

## 8. Docker and environment
- `docker-compose.yml` gains:
```yaml
  agent:
    build: apps/agent
    image: mnemosyne-agent:local
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY in .env}
      AGENT_SECRET: ${AGENT_SECRET:?Set AGENT_SECRET in .env}
      VAULT_PATH: /vault
    volumes:
      - ${VAULT_HOST_PATH:?Set VAULT_HOST_PATH in .env to your Obsidian vault folder}:/vault:ro
    read_only: true
    tmpfs:
      - /tmp
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8100/health', timeout=3).status == 200 else 1)" ]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
```
  and the `mnemosyne` service gains `AGENT_URL: http://agent:8100`. No `ports:` on `agent`, no `depends_on` either way.
- `apps/agent/Dockerfile`: `python:3.14-slim`; `COPY --from=ghcr.io/astral-sh/uv:<pinned version> /uv /bin/uv`; copy `pyproject.toml` and `uv.lock`, `uv sync --frozen --no-dev --no-install-project`, then copy `src/` and `uv sync --frozen --no-dev`; a non-root user; `ENV UV_NO_CACHE=1 PYTHONDONTWRITEBYTECODE=1`; `CMD [ "uv", "run", "--no-sync", "uvicorn", "mnemosyne_agent.main:app", "--host", "0.0.0.0", "--port", "8100" ]` (or the venv's `uvicorn` directly, whichever runs under `read_only: true`; the task checks). `.dockerignore` excludes `.venv`, `tests`, `schema/examples`, caches.
- A `docker`-marked pytest builds the image and runs it with a fixture vault mounted read-only, checking `/health` and that a write to `/vault` fails.
- The app's root `Dockerfile` is unchanged.

## 9. Tests

### 9.1 Rules
- No test touches the network, the Claude API or a real vault. The agent uses the scripted fake Claude and `tests/fixtures/vault/` (copied to a temporary directory per test where a test needs to change it); the server mocks `fetch` in `agent.client.test.ts` and mocks `clients/agent.client.js` in service and worker tests.
- Existing tests pass unchanged, except where a contract gains fields (`Job`, `Settings`, `JobStatus` lists, fixtures) or where a test lists every job status or every profile; list each in the log line.
- The fixture vault holds about eight notes across two folders with front-matter, tags, existing `[[links]]` (including aliases, headings, an embed and a link inside a code block), one unresolved concept used three times, a `.obsidian/` folder and a non-Markdown file.
- Linker loop tests script whole conversations: list → search → read → submit; invalid submit then valid; invalid twice; no tool call; turn and tool-call limits; timeout (with a fake clock or a tiny `run_timeout_seconds`); API error.

### 9.2 Contract tests
§3.2: export drift (pytest), examples (pytest and Vitest).

## 10. Phases and checkpoints
See `tasks.md`. Checkpoint A depends on Naresh's scaffold (§2.1); its first task checks it and stops if it's missing.
