# Tasks — Mnemosyne v0.7.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package (and `test:browser` for web), browser screenshots (light and dark) of any screens touched, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR (from 0047) and add its number to the task's ADR column.
- **The Python project is scaffolded by Naresh** (TRD §2.1). Never run `uv init` or recreate `pyproject.toml`; add dependencies only with `uv add`, and only those TRD §1 names.
- **Work in `apps/agent` follows `apps/agent/CLAUDE.md`** (house style, no formatter, `ruff check` without `--fix`).
- **Dependencies:** only the ones in TRD §1, each added by the task that first uses it. Check its real API against the TRD first; if it differs in a way that changes the design, stop and ask.
- **No test touches the network, the Claude API or a real vault.** Use the scripted fake Claude, the fixture vault, and `fetch` mocks.
- Existing tests pass unchanged, except the changes TRD §9.1 allows; list each one in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–2 (kick-off and contract)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

Needs Naresh's scaffold in `apps/agent` (TRD §2.1). Check it exists before planning; if not, stop and ask.

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Set ADRs 0042–0046 to Accepted (Status lines and the `docs/README.md` index). Root `CLAUDE.md`: current version 0.7.0 and the `docs/v0.7.0/` paths in Workflow, `apps/agent` in the Folders table, and the contract exception (ADR 0043) under "Rules that span apps" | 0042–0046 | ✅ |
| 1.2 | Check the scaffold (Python 3.14, `src/mnemosyne_agent`, the five dependencies, `uv.lock`, `.gitignore` entries); add `apps/agent/package.json`, the Ruff, Pyright and pytest sections of `pyproject.toml`, and one passing smoke test so `pnpm -r test|lint|typecheck` cover the agent (TRD §2.1) | 0042 | ✅ |
| **Phase 2** | **Contract** | | |
| 2.1 | `contract/` Pydantic models with tests (limits, `failed` needs a reason and no suggestions, `linked` has no reason) (TRD §3.1) | 0043 | ✅ |
| 2.2 | `contract/export.py`, the committed `schema/link_contract.json`, and the drift test (TRD §3.2) | 0043 | ✅ |
| 2.3 | Golden examples (valid and invalid) and `tests/contract/test_examples.py` (TRD §3.2) | 0043 | ✅ |
| 2.4 | `packages/shared/src/agent.ts` Zod mirror, exported from `index.ts`, with `agent.examples.test.ts` over the same examples (TRD §3.3) | 0043 | ✅ |

## Checkpoint B: Phases 3–4 (vault tools and the agent)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 3** | **Vault tools** | | |
| 3.1 | The fixture vault (TRD §9.1) and `vault/paths.py`: inside-root resolution, symlink escapes, dot-folders, `.md` only (TRD §2.4) | 0042 | ✅ |
| 3.2 | `vault/notes.py`: `list_notes` (front-matter title and tags, stem fallback, cap with `omitted`) and `read_note` (cap with `truncated`) (TRD §2.4) | 0044 | ✅ |
| 3.3 | `vault/search.py`: terms and quoted phrases, case-insensitive, ordering, snippets, cap (TRD §2.4) | 0044 | ✅ |
| 3.4 | `vault/links.py`: wikilink parsing (aliases, headings, embeds and code skipped), grouping with kept casing, `has_note`, ordering, cap (TRD §2.4) | 0044 | ✅ |
| **Phase 4** | **Agent service** | | |
| 4.1 | `config.py` and `main.py`: `create_app`, bearer auth with `hmac.compare_digest`, `/health` (200 / 503), docs routes off, request logging without content (TRD §2.2–2.3) | 0042 | ⬜ |
| 4.2 | `claude.py`: the `ClaudeClient` protocol, its models, `AnthropicClaude`, and the scripted fake in `tests/` (TRD §2.5) | 0042 | ⬜ |
| 4.3 | `linker/instructions.py`, `linker/tools.py` and `GET /v1/link/instructions` (TRD §2.6, §2.8) | 0044, 0046 | ⬜ |
| 4.4 | `linker/loop.py`: the tool loop, caching blocks, usage across calls, corrective turns, turn / tool-call / timeout limits, API errors as `failed` (TRD §2.6) | 0044 | ⬜ |
| 4.5 | `linker/checks.py`: computed kinds and casing, self-links, anchor fallback to Related, duplicates, cap (TRD §2.7) | 0044 | ⬜ |
| 4.6 | `POST /v1/link` end to end with the fake Claude and the fixture vault; invalid bodies as `failed` at HTTP 200; 401 (TRD §2.3, §2.8) | 0042, 0043 | ⬜ |
| 4.7 | `Dockerfile`, `.dockerignore`, the `agent` Compose service and `AGENT_URL` on `mnemosyne`; the `docker`-marked test (health, read-only vault); `.env.example` (TRD §8, §6.1 last bullet) | 0042 | ⬜ |

## Checkpoint C: Phases 5–6 (shared, data and server)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 5** | **Shared and data** | | |
| 5.1 | Shared: `JobStatus` `linking`, `LinkState`, `Job` link fields (server returns null / `'off'` until 6.2), `LinkRun`, `LinkUsageSummary`, `linkSuggestions.ts`, `Settings` and `GetSettingsResponse` additions (TRD §4.1, §4.2, §4.4) | 0045, 0046 | ⬜ |
| 5.2 | Shared `wikilinks.ts`: `findAnchor`, `insertLink`, `isStale`, `hasWikilink` with the TRD §4.3 cases | 0045 | ⬜ |
| 5.3 | Migration 7 `addLinking`, tested from version 6 and from empty; seeded linker profile and version (TRD §5.1) | 0046 | ⬜ |
| 5.4 | Repositories: `promptProfiles` purpose, `linkRuns`, `linkSuggestions`, `jobStore` link columns, runnable `linking`, cascade on delete; `apps/server/CLAUDE.md` repositories line (TRD §5.2) | 0045, 0046 | ⬜ |
| **Phase 6** | **Server** | | |
| 6.1 | Config `config.agent` and `clients/agent.client.ts` (`requestLinks`, `fetchInstructions`, `checkHealth` with its cache, `AgentError` messages) (TRD §6.1–6.2) | 0042 | ⬜ |
| 6.2 | Job flow: `completeSummary` to `linking`, `worker/linkJob.ts`, `runJob`, link runs and cost, `completeLinking` / `failLinking`, restart recovery, `regenerateSummary` supersedes, `link_usage` on `Job` (TRD §6.3) | 0044, 0045 | ⬜ |
| 6.3 | `runLinking`, `acceptSuggestions` (one transaction with the draft), `rejectSuggestions`, and the four routes (TRD §6.3–6.4) | 0045 | ⬜ |
| 6.4 | Settings (`linking_enabled`, `linking_model` with its fallback, `linker_profile_id`, `linker_locked_instructions`, `agent_status`); `DEFAULT_LINKER_GUIDANCE`; profile routes by purpose, the linker profile's 409s and 400s, `resolveLinkerPrompt`, reset; `apps/server/CLAUDE.md` (TRD §6.5–6.6) | 0046 | ⬜ |

## Checkpoint D: Phase 7 (web)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Web** | | |
| 7.1 | `api/linkSuggestions.api.ts`, `linkSuggestionKeys`, `useLinkSuggestions`, `useAcceptLinkSuggestions`, `useRejectLinkSuggestions`, `useRunLinking`; `useJob` polls `linking` (TRD §7.1) | 0045 | ⬜ |
| 7.2 | `JobProgress` Linking step (TRD §7.2) | 0044 | ⬜ |
| 7.3 | `LinkSuggestionsPanel` rows: target, kind chips, placement, Stale, Already linked, reason, decided rows (TRD §7.3) | 0045 | ⬜ |
| 7.4 | Review screen tabs (Suggested links / Source); Accept, Add to Related, Reject, Accept all, Reject all wired to the editor and autosave (TRD §7.3) | 0045 | ⬜ |
| 7.5 | Linking failure alert with Retry linking, Re-run linking with confirm, Run linking, not-configured note; linking usage in `SummaryInfo` (TRD §7.3) | 0044 | ⬜ |
| 7.6 | `LinkingSettings`: agent status, the switch, the model select, the linker prompt editor and history, locked instructions (TRD §7.4); `apps/web/CLAUDE.md` names the new components | 0046 | ⬜ |

## Checkpoint E: Phase 8 (clean-up and verification)
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **Clean-up and verification** | | |
| 8.1 | README: the agent service (what it is, `AGENT_SECRET` with `openssl rand -hex 32`, running it outside Docker with `pnpm --filter @mnemosyne/agent dev` and `VAULT_PATH`), linking and review, Settings → Linking, endpoints, troubleshooting (agent unavailable, wrong secret); the root `CLAUDE.md` architecture paragraph (linking) | 0042, 0044 | ⬜ |
| 8.2 | Version 0.7.0 in every `package.json`, `apps/agent/pyproject.toml` and the README status line | | ⬜ |
| 8.3 | Final checks: all tests, lint, typecheck, build, browser tests, the agent's `docker` tests, `docker compose build`; migration on a copy of the real 0.6.0 database; with Naresh, on the emptied vault: three notes summarized and linked in Docker, accepting and rejecting links, a stale suggestion into Related, Re-run linking, a saved note's links (and a concept) visible in Obsidian's graph, the fourth note linking to the first three, linking with the agent container stopped | 0042–0046 | ⬜ |
| 8.4 | `release-notes.md` (upgrade steps: database backup, `AGENT_SECRET`, `docker compose up --build`; wipe the vault first as planned), linked from `docs/README.md` | 0042 | ⬜ |

---

## Log

- 1.1 ✅ ADRs 0042–0046 Accepted (files and index); root CLAUDE.md: 0.7.0 paths, `apps/agent` row, ADR 0043 contract exception. Docs only. Scaffold was renamed to the TRD layout first (`apps/mnemosyne_agent` → `apps/agent`, `src/agent` → `src/mnemosyne_agent`, project `mnemosyne-agent`) at Naresh's choice.
- 1.2 ✅ Scaffold checked (Python 3.14, `src/mnemosyne_agent`, fastapi/uvicorn/anthropic + pytest/ruff/pyright, `uv.lock`); added `package.json`, Ruff/Pyright/pytest sections, root `.gitignore` entries, `tests/test_smoke.py`. Red was `pnpm --filter @mnemosyne/agent test` matching no project (the smoke test can't fail on content). `pnpm -r test` green across all four packages; no existing test changed.
- 2.1 ✅ `contract/link.py`: eight models, every key required, `LinkResponse` validator for linked/failed. 39 tests (limits at both edges, missing keys, outcome rules). `LinkUsage` counts have no `ge=0` (TRD doesn't specify). Red: module missing.
- 2.2 ✅ `contract/export.py` (`build_schema()`, `__main__` writes `schema/link_contract.json`) and `tests/contract/test_export.py` (drift, format, eight `$defs`, required keys). Red: module missing, then file missing.
- 2.3 ✅ Six valid and six invalid golden examples in `apps/agent/schema/examples/` (TRD minimum plus failed-with-suggestions and linked-with-reason) and `tests/contract/test_examples.py`. Red: the minimum-files test failed with no examples.
- 2.4 ✅ `packages/shared/src/agent.ts` Zod mirror (exported from `index.ts`), `agent.test.ts` (43 cases mirroring 2.1) and `agent.examples.test.ts` over the same example files. Red: `./agent.js` missing. 411 → 454 shared tests; no existing test changed.
- 3.1 ✅ Fixture vault (8 notes in 3 folders, `.obsidian/`, `.trash/`, a `.txt`), `conftest.py` (`fixture_vault`, `vault_copy`), `vault/paths.py` (`resolve_note`, `iter_note_paths`, typed outcomes). 12 tests incl. symlink escapes. Red: module missing.
- 3.2 ✅ `vault/notes.py`: `list_notes` (capped, `omitted`), `list_all_notes` (uncapped), `read_note` (`truncated`), YAML-subset front-matter reader. Functions take root and limits as arguments (checkpoint plan decision 1). 13 tests. Red: module missing.
- 3.3 ✅ `vault/search.py`: terms and quoted phrases, case-insensitive, ordering by matching lines then path, centred snippets, cap with `omitted`. 9 tests. Red: module missing.
- 3.4 ✅ `vault/links.py`: `parse_wikilink_targets` (aliases, headings; embeds, fenced and inline code skipped), `collect_link_targets` (uncapped, case-grouped, `has_note` over all notes), `list_link_targets` (capped). 13 tests. Red: module missing.
