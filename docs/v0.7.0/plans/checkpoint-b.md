# Checkpoint B plan: Phases 3–4 (vault tools and the agent)

Next: **Checkpoint B, task 3.1** (Plan cell ⬜). On approval: save this to `docs/v0.7.0/plans/checkpoint-b.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint B`, push, then start 3.1.

Read for this checkpoint: PRD, TRD §2 and §8, `tasks.md`, ADRs 0042, 0044, 0046. All work is in `apps/agent` and follows its `CLAUDE.md`. The checkpoint also touches the root `docker-compose.yml` and `.env.example` (4.7). Order is strict. Every task: red (watch it fail for the right reason) → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: `uv run pytest`, `uv run ruff check`, `uv run pyright` (and root `pnpm -r test|lint|typecheck` at the end). Tests never touch the network, the real Claude API or a real vault.

## Decisions taken while planning (all inside the TRD's intent; flagged so you can object)
1. **Vault functions take explicit arguments, not `Settings`.** `config.py` doesn't exist until 4.1, so `list_notes( root, limit )`, `read_note( root, path, max_chars )`, `search_vault( root, query, hits_limit, snippet_chars )`, `list_link_targets( root, limit )` take the root and limits as parameters. From 4.3 the tool dispatcher passes the values from `settings`. TRD §2.4 says "take the vault root from settings"; the thresholds still come from settings, never literals.
2. **Uncapped scans beside the capped tool listings.** `list_all_notes( root )` and `collect_link_targets( root )` return everything; `list_notes` and `list_link_targets` cap them with `omitted`. `has_note` (3.4) and the post-checks (4.5) need the full sets, not the capped ones.
3. **`app` for uvicorn is built lazily** with a module-level `__getattr__` in `main.py`, so `mnemosyne_agent.main:app` (TRD §2.1 and §8) works but importing `main` in a test doesn't read the environment. Nothing is cached or mutated.
4. **`create_app( settings )` in 4.1, `create_app( settings, claude )` in 4.2.** `ClaudeClient` doesn't exist until 4.2. Tests build the app through one `conftest.py` helper, so 4.2 changes that helper only; I'll list it in the 4.2 log line.
5. **API errors:** TRD §2.6 says `claude.py` is the only module importing `anthropic` and also that the caller catches `anthropic.APIError`. These conflict. `AnthropicClaude` catches `anthropic.APIError` and raises `ClaudeError( status, message )`, defined in `claude.py`; the loop catches that and returns `failed`.
6. **Kinds arrive in 4.5.** In 4.4 the loop returns suggestions with a placeholder kind (`new_concept`) and its tests don't assert kinds; 4.5 adds `apply_checks`, wires it into `run_linker`, and asserts the computed kinds.
7. **Counting:** `tool_calls` counts every `tool_use` block, including `submit_suggestions` and invalid ones; `turns` counts Claude calls. If one reply contains `submit_suggestions` plus other tool uses, only the submit is acted on.

## 3.1 Fixture vault and `vault/paths.py` (ADR 0042)
- **Fixture vault** `tests/fixtures/vault/` (9 notes, 3 folders):
  - `Index.md` (root): links to `[[Unit Economics]]`, `[[Missing Note]]`.
  - `Ideas/Pricing Playbook.md`: front-matter title and `tags: [ saas, pricing ]`; `[[Customer Discovery]]`, `[[Unit Economics|unit economics]]`.
  - `Ideas/Developer Tools.md`: `tags: devtools, saas` (comma string); `[[Pricing Playbook#Tiers]]`, `[[customer discovery]]`.
  - `Ideas/Marketplace Idea.md`: no front-matter (stem title); `[[Customer Discovery]]`, `![[diagram.png]]`.
  - `Ideas/Untitled Draft.md`: front-matter with no closing `---` (malformed).
  - `Reading/Unit Economics.md`: a `[[Not A Link]]` inside a fenced block, `[[Also Not]]` inside inline code.
  - `Reading/Thinking Fast and Slow.md`: block-list tags.
  - `Reading/Quoted Title.md`: `title: "Quoted: Title"`.
  - `Reading/attachment.txt`; `.obsidian/app.json`; `.trash/Deleted Note.md` (non-Markdown and Obsidian folders).
  - "Customer Discovery" is the unresolved concept used three times (two casings).
- `tests/conftest.py`: `fixture_vault` (path to the committed vault, never written to) and `vault_copy` (a fresh copy in `tmp_path`).
- **Tests first** (`tests/vault/test_paths.py`), one behaviour at a time: `resolve_note` returns the file for a valid relative path; rejects `..` escapes, absolute paths, a symlink (file) pointing outside, a file reached through a symlinked folder that leaves the vault; rejects non-`.md`; rejects any path through a dot-folder or dot-file (`.obsidian/…`, `.trash/…`); a missing file; every rejection is a typed value with a reason, nothing raised for user input. `iter_note_paths( root )` yields only `.md` files, sorted, skipping dot-folders, not following symlinks that leave the root.
- Green: `NotePathOutcome` `StrEnum` (`ok`, `outside_vault`, `not_markdown`, `hidden`, `not_found`), `ResolvedNote` model (`path`, `outcome`, `reason`), `resolve_note`, `iter_note_paths`. Red: module missing.
- Commit `feat(3.1): fixture vault and safe note paths`.

## 3.2 `vault/notes.py` (ADR 0044)
- **Tests first** (`tests/vault/test_notes.py`): `list_notes` returns `{ path, title, tags }` sorted by path; front-matter title wins, else stem; tags from inline list, comma string and block list; quoted title unquoted; malformed or missing front-matter → stem and no tags; dot-folders and `.txt` excluded; `limit` caps and sets `omitted` to the count not shown; `list_all_notes` is uncapped. `read_note` returns `{ path, title, content, truncated }`; content cut at `max_chars` with `truncated = True`, whole content with `False`; invalid paths return the `resolve_note` failure reason.
- Green: models `NoteSummary`, `NoteList`, `NoteContent`, `ReadNoteResult` (`outcome`, `reason`, `note`); a small YAML-subset front-matter reader for `title` and `tags` only (no new dependency).
- Commit `feat(3.2): list and read vault notes`.

## 3.3 `vault/search.py` (ADR 0044)
- **Tests first** (`tests/vault/test_search.py`): a single term; several terms must all be on the same line; a quoted phrase stays together; case-insensitive; hits `{ path, line (1-based), snippet }`; ordered by matching-line count per note (descending), then path, then line; snippet is `snippet_chars` long centred on the first term, whole line when shorter; `hits_limit` caps with `omitted`; empty or blank query → no hits; dot-folders not searched.
- Green: `search_vault( root, query, hits_limit, snippet_chars ) -> SearchResult`, with models `SearchHit`, `SearchResult`.
- Commit `feat(3.3): vault text search`.

## 3.4 `vault/links.py` (ADR 0044)
- **Tests first** (`tests/vault/test_links.py`): parsing `[[a]]`, `[[a|alias]]`, `[[a#h]]`, `[[a#h|alias]]` → target `a`; `![[embed]]` skipped; fenced code blocks and inline code skipped; empty target (`[[#heading]]`) skipped; grouping is case-insensitive with the most-used casing kept (ties → the sorted-first casing); `uses` counts; `has_note` true when a title or stem matches case-insensitively (computed over all notes, not the capped list); order by `uses` descending then target; `limit` caps with `omitted`; against the fixture vault: "Customer Discovery" has 3 uses and `has_note` false, "Unit Economics" `has_note` true.
- Green: `parse_wikilink_targets( text )` (reused by 4.5), `collect_link_targets( root )`, `list_link_targets( root, limit )`, models `LinkTarget`, `LinkTargetList`.
- Commit `feat(3.4): vault link targets`.

## 4.1 `config.py` and `main.py` (ADR 0042)
- **Tests first:**
  - `tests/test_config.py`: `load_settings( environ )` with the three required variables gives defaults for all limits (12, 24, 4096, 90, 8, 500, 20, 200, 8000, 500); `AGENT_MAX_TURNS`-style overrides apply; missing `ANTHROPIC_API_KEY`, `AGENT_SECRET` shorter than 32 characters, missing or non-directory `VAULT_PATH` each raise an error whose message names the variable and contains neither the key nor the secret.
  - `tests/test_main.py` (FastAPI `TestClient`; if `httpx` is missing, `uv add --dev httpx` per TRD §1): `/health` is 200 `{ status: ok, vault: readable }` without auth; 503 `{ status: error, vault: unreadable }` after the vault folder is removed; `/docs`, `/redoc`, `/openapi.json` are 404; the auth dependency (built by `create_secret_check( settings )`, mounted in the test on its own tiny app, because no `/v1` route exists yet) answers 401 `{ "detail": "unauthorized" }` for a missing header, a wrong secret and a non-Bearer scheme, and lets the right secret through; request logging (`caplog`): one line per request with route, status and duration, and it contains none of the secret, the key or a request body sentinel; importing `mnemosyne_agent.main` doesn't need the environment.
- Green: `Settings` model and `load_settings` (errors built from the field names only), `create_app( settings )` with docs routes off, the health route, `create_secret_check` using `hmac.compare_digest`, a logging middleware, and the lazy `app`.
- Commit `feat(4.1): agent config, auth and health`.

## 4.2 `claude.py` (ADR 0042)
- **Tests first:**
  - `tests/test_claude.py`: `AnthropicClaude` against `anthropic.AsyncAnthropic` given an `httpx.MockTransport` (no network): the outgoing JSON carries model, max tokens, system blocks and tools with `cache_control`, messages with `tool_use` and `tool_result` blocks; the reply maps text and `tool_use` blocks, stop reason, and usage including `cache_read_input_tokens` and `cache_creation_input_tokens` (missing → 0); a 429 or 500 becomes `ClaudeError` with the status and message; only this module imports `anthropic` (grep-style test over `src/`).
  - `tests/fakes.py` `ScriptedClaude` (returns queued replies, raises queued `ClaudeError`s, records every request, fails loudly when the queue is empty), with `tests/test_fakes.py` covering those four behaviours.
- Green: models (`CacheControl`, `SystemBlock`, `ToolDefinition`, `TextBlock`, `ToolUseBlock`, `ToolResultBlock`, `Message`, `MessageRequest`, `Usage`, `MessageReply`), `ClaudeClient` `Protocol`, `ClaudeError`, `AnthropicClaude`. `create_app( settings, claude )` and the lazy `app` take it; the `conftest.py` app helper changes (listed in the log).
- Commit `feat(4.2): Claude client boundary and scripted fake`.

## 4.3 `linker/instructions.py`, `linker/tools.py`, `GET /v1/link/instructions` (ADRs 0044, 0046)
- **Tests first:**
  - `tests/linker/test_instructions.py`: `build_instructions( max_suggestions )` names all five tools, `submit_suggestions` as the only way to finish, reuse before invent, Title Case / singular / short noun phrase, the exact-phrase anchor rule and its exclusions (front-matter, headings, quotes, timestamps, existing links; null for Related), one-line reasons, and the number given; no unfilled `{}` placeholders. Wording is yours to edit afterwards; the test checks facts, not prose.
  - `tests/linker/test_tools.py`: five definitions with the right names and required fields (`search_vault.query`, `read_note.path`, `submit_suggestions.suggestions[].target|anchor|reason`, no `kind`); `run_vault_tool` returns JSON text for each vault tool using the settings limits, returns an error result for an unknown tool, a missing argument and a bad path.
  - `tests/test_main.py`: `GET /v1/link/instructions` is 401 without the secret and 200 with it, returning `{ instructions }`.
- Green: the instruction text (as a template with `{max_suggestions}`), `SubmittedSuggestion` and `SubmitSuggestions` models (submit schema derived from them), tool definitions, `run_vault_tool( name, arguments, settings ) -> ToolResult`, and the `/v1` router with the secret check.
- Commit `feat(4.3): linker instructions and tools`.

## 4.4 `linker/loop.py` (ADR 0044)
- **Tests first** (`tests/linker/test_loop.py`, whole scripted conversations): list → search → read → submit → `linked`; submit straight away; system prompt is instructions + `## Guidance` + guidance, `cache_control` on its last block and on the last tool; the note goes in the first user message, not the system prompt; usage summed across all calls (including cache fields), `turns` and `tool_calls` counted; invalid submit then valid → one corrective `tool_result` with `is_error` naming the errors, then `linked`; invalid twice → `failed` "Suggestions failed validation twice (N errors)"; a reply with no tool call → one corrective turn, again → `failed` with its numbers; turn limit and tool-call limit → `failed` with "Stopped after 24 tool calls (limit 24)" style text (limits shrunk through settings); timeout with a tiny `run_timeout_seconds` and a fake that sleeps → "Timed out after N s"; `ClaudeError` 429 → `failed` with the status and message; every `failed` response has empty suggestions and the usage so far; the vault is never written (fixture vault checksum unchanged).
- Green: `run_linker( request, settings, claude ) -> LinkResponse`, `asyncio.timeout`, guard clauses first.
- Commit `feat(4.4): linker tool loop`.

## 4.5 `linker/checks.py` (ADR 0044)
- **Tests first** (`tests/linker/test_checks.py`, in TRD §2.7 order): empty targets dropped, whitespace trimmed and collapsed; kind computed against the vault (note title or stem → `existing_note` with the target rewritten to the title; existing link target → `existing_concept` with the kept casing; else `new_concept`); self-link by title dropped case-insensitively; anchor not found verbatim (case-sensitive) → `None`; found anchor kept; duplicate targets dropped case-insensitively after rewriting, first kept; capped to `max_suggestions`; order preserved. Then `test_loop.py` gains the computed-kind assertions through `run_linker`.
- Green: `apply_checks( submitted, note, notes, link_targets, settings ) -> list[LinkSuggestion]` using `list_all_notes` and `collect_link_targets`; `run_linker` calls it on a valid submit.
- Commit `feat(4.5): linker post-checks`.

## 4.6 `POST /v1/link` end to end (ADRs 0042, 0043)
- **Tests first** (`tests/test_link_route.py`, `create_app` with `ScriptedClaude` and a `vault_copy`): a valid request runs a scripted conversation and returns 200 with computed kinds, usage and `outcome linked`; an empty vault gives concept suggestions; a Claude API error returns 200 `failed` with the reason; a body with an empty `note.body` returns 200 `failed` (reason names the error count and first field, usage zeros, never 422); non-JSON body returns 200 `failed`; no or wrong secret returns 401, and a wrong secret with an invalid body is still 401; the response always validates as `LinkResponse`; the request log line carries tool calls and tokens but no body, guidance, secret or key.
- Green: the route, the `RequestValidationError` handler for `/v1` that builds the `failed` response, tool-call and token counts handed to the logging middleware through `request.state`.
- Commit `feat(4.6): POST /v1/link`.

## 4.7 Docker, Compose, `.env.example` (ADR 0042)
- **Tests first:** `tests/docker/test_container.py` marked `docker`: builds the image, runs it with `--read-only --tmpfs /tmp` and the fixture vault mounted `:ro`, polls `/health` until 200, and checks that a write inside `/vault` fails. I'll run `uv run pytest -m docker` and watch it fail (no Dockerfile), then pass.
- Green: `apps/agent/Dockerfile` per TRD §8 (`python:3.14-slim`, pinned uv copied from `ghcr.io/astral-sh/uv:<the version installed here>`, two-step `uv sync --frozen --no-dev`, non-root user, `UV_NO_CACHE=1`, `PYTHONDONTWRITEBYTECODE=1`; run the venv's `uvicorn` directly if `uv run` needs to write under `read_only`), `.dockerignore`, the `agent` Compose service with `AGENT_URL: http://agent:8100` on `mnemosyne` (exactly as TRD §8), and `AGENT_SECRET`, `AGENT_URL`, `VAULT_PATH` documented in `.env.example` (check whether both `.env.example` files need them). The root app `Dockerfile` is untouched.
- Verify: `docker compose config`, `docker compose build agent`, the docker test. If no Docker daemon is available I'll say so in the report rather than tick around it.
- Commit `feat(4.7): agent Dockerfile and Compose service`.

## End of checkpoint
Report per CLAUDE.md: tasks with hashes; pytest, ruff and pyright for `apps/agent`, plus root `pnpm -r test|lint|typecheck`; the docker test result; ADRs (none expected to change the TRD; decisions 1–7 above are the places this plan reads the TRD narrowly); anything deferred.

## Verification
- `cd apps/agent && uv run pytest && uv run ruff check && uv run pyright`; `uv run pytest -m docker`
- `pnpm -r test && pnpm -r lint && pnpm -r typecheck`
- After 4.6, by hand: run `AGENT_SECRET=… VAULT_PATH=tests/fixtures/vault pnpm --filter @mnemosyne/agent dev` and `curl /health` and an unauthorized `/v1/link/instructions` (expects 401).
