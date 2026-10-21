# Checkpoint A plan: Phases 1–2 (kick-off and contract)

Next: **Checkpoint A, task 1.1** (Plan cell ⬜). On approval: save this to `docs/v0.7.0/plans/checkpoint-a.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint A`, push, then start 1.1.

Every task: red (watch it fail for the right reason) → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: test, lint, typecheck for every package touched (`apps/agent`, `packages/shared`). Agent code follows `apps/agent/CLAUDE.md` (house style, no formatter, `ruff check` without `--fix`).

## Done before planning (scaffold alignment, needs committing in 1.2)
Naresh's scaffold was at `apps/mnemosyne_agent` with package `src/agent` and project name `mnemosyne_agent`. At Naresh's choice I renamed it to the TRD §2.1 layout: `apps/agent`, `src/mnemosyne_agent`, project name `mnemosyne-agent` (script entry `mnemosyne-agent`), and re-ran `uv sync` to rebuild `.venv`. No `uv init`, no dependency edits. Dependencies present: fastapi, uvicorn, anthropic; dev: pytest, ruff, pyright. 1.2 commits the scaffold files (`pyproject.toml`, `uv.lock`, `.python-version`, `.gitignore`, `src/`).

## 1.1 Accept ADRs, root CLAUDE.md (docs only, no tests)
- Files: `docs/decisions/0042…0046-*.md` Status → Accepted; `docs/README.md` rows 63–67 → Accepted; root `CLAUDE.md`:
  - Workflow step 1 and step 3 paths `v0.6.0` → `v0.7.0` (the "current version 0.7.0" edit is already in the working tree; it goes in this commit).
  - Folders table: add `apps/agent` (Python vault agent service: read-only vault tools and Claude tool-use agents, stateless).
  - "Rules that span apps": add the contract exception (ADR 0043): the agent contract is Pydantic-sourced, mirrored by hand in `packages/shared/src/agent.ts`, changed in one commit with the export and examples.
  - The architecture paragraph is 8.1, not here.
- Verify: grep Status lines and the index; no tests.
- Commit `docs(1.1): accept ADRs 0042–0046, root CLAUDE.md for 0.7.0`.

## 1.2 Scaffold check, tooling, smoke test
- Check: Python 3.14 (`.python-version`), `src/mnemosyne_agent`, the five dependencies in `uv.lock`, `.gitignore` entries. `.venv/` and `__pycache__/` are in `apps/agent/.gitignore` but not the root `.gitignore`; TRD says root, so add them there too.
- Files: `apps/agent/package.json` (`@mnemosyne/agent`, private, version 0.6.0, scripts `test`/`lint`/`typecheck`/`dev` per TRD §2.1, no `build`); `pyproject.toml` tool sections (Ruff `py314`, line length 120, select `E4 E7 E9 F B UP N SIM`; Pyright strict, `include = [ "src", "tests" ]`; pytest `testpaths`, `docker` marker, `addopts = "-m 'not docker'"`) edited by hand, tool sections only; `tests/test_smoke.py` (+ `tests/__init__.py` only if pytest needs it); root `.gitignore`.
- Red: `pnpm --filter @mnemosyne/agent test` fails (no package / no script). Green: add `package.json` and the config; the smoke test asserts the package imports and exposes `main`. The smoke test can't fail for a content reason, so the red is the missing script; I'll say that in the log.
- Run `pnpm install` to register the workspace package (lockfile change is only the new importer; stage by name). Check `pnpm -r test|lint|typecheck` include the agent and the existing packages still pass.
- Commit `feat(1.2): agent tooling and smoke test`.

## 2.1 Contract models (`contract/link.py`)
- Tests first (`tests/contract/test_link.py`), written one behaviour at a time:
  - `LinkNote`: title 0/1/300/301 chars, tags 50/51, body 0/1/200_000/200_001, `folder` null accepted, key missing rejected.
  - `LinkRequest`: model empty rejected, guidance 20_000/20_001, nested note validated.
  - `LinkSuggestion`: target 1..200, reason 1..300, `anchor` null accepted but key required, unknown kind rejected.
  - `LinkUsage`: all six ints required.
  - `LinkResponse`: `failed` needs a non-empty reason and no suggestions; `failed` with suggestions rejected; `linked` with a reason rejected; `linked` with zero suggestions accepted; every key required (including `reason`, `suggestions`, `usage`).
  - `InstructionsResponse` round trip.
- Red: module missing. Green: `contract/__init__.py` and `contract/link.py` with the TRD §3.1 models (`StrEnum`s, `Field` limits, a `model_validator` on `LinkResponse`, all keys required; no `extra="forbid"`, to match Zod's default stripping).
- Decision to confirm: `LinkUsage` ints get no `ge=0`, because the TRD doesn't specify one. I'll mirror that in Zod.
- Commit `feat(2.1): agent contract models`.

## 2.2 Export and drift test
- Tests first (`tests/contract/test_export.py`): `build_schema()` returns text equal to the committed `schema/link_contract.json`; text has sorted keys, two-space indent, trailing newline; `$defs` has an entry for each of the 8 models; request models use validation mode, response models serialization mode.
- Red: `export` missing; then, after the module exists, the file is missing. Green: `contract/export.py` (`build_schema()` using Pydantic's `models_json_schema` with a mode per model, and a `__main__` that writes `schema/link_contract.json`); run `uv run python -m mnemosyne_agent.contract.export` and commit the file.
- Commit `feat(2.2): agent contract JSON Schema export`.

## 2.3 Golden examples (Python side)
- Files: `schema/examples/valid/` — `link-request.json`, `link-request-empty-vault.json`, `link-response-linked.json`, `link-response-linked-empty.json`, `link-response-failed.json`, `instructions-response.json`; `schema/examples/invalid/` — request with an empty body, request with no model, response with an unknown kind, failed response without `reason`; plus two extra invalid ones (failed with suggestions; linked with a reason). Each is `{ "schema": "<ModelName>", "value": … }`.
- Tests first (`tests/contract/test_examples.py`): parametrized over the globbed files; valid must validate against the named model, invalid must raise `ValidationError`; an unknown `schema` name fails (tested with a tmp file); at least the TRD's minimum files exist.
- Red: the test runs with no example files, so I add the test plus the valid files and confirm failure first for the unknown-name/minimum-files tests, then green. Examples are data, so the red comes from the test's "minimum set exists" assertion.
- Commit `feat(2.3): agent contract golden examples`.

## 2.4 Zod mirror
- Tests first: `packages/shared/src/agent.test.ts` (limits and the `LinkResponse` refinement mirroring 2.1 case for case) and `agent.examples.test.ts` (reads `apps/agent/schema/examples/{valid,invalid}` relative to the repo root via `import.meta.url`; maps `schema` name → Zod schema; unknown name fails; valid parses, invalid doesn't).
- Red: `./agent.js` missing. Green: `packages/shared/src/agent.ts` — `LinkNote`, `LinkRequest`, `SuggestionKind`, `LinkSuggestion`, `LinkUsage`, `LinkOutcome`, `LinkResponse` (refined), `InstructionsResponse`, snake_case keys, same limits, each exported as value and type; export from `index.ts`. No name collisions with existing shared exports (checked: none).
- Commit `feat(2.4): agent contract Zod mirror`.

## End of checkpoint
Report per CLAUDE.md "Before you stop": tasks with hashes; test/lint/typecheck for `apps/agent` and `packages/shared` (plus a root `pnpm -r` run); ADR acceptance (none change the TRD); the scaffold rename; log lines in `tasks.md` (tick Status per task).

## Verification
- `cd apps/agent && uv run pytest && uv run ruff check && uv run pyright`
- `pnpm --filter @mnemosyne/shared test lint typecheck`, then root `pnpm test && pnpm lint && pnpm typecheck`
- Drift check by hand once: change a limit in `contract/link.py`, confirm `test_export` fails, revert.
