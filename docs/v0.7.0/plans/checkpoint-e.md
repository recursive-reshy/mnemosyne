# Checkpoint E plan: Phase 8 (clean-up and verification)

Next: **Checkpoint E, task 8.1** (Plan cell ⬜). On approval: save this to `docs/v0.7.0/plans/checkpoint-e.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint E`, push, then start 8.1.

Read for this checkpoint: PRD, TRD §8–9, `tasks.md`, ADRs 0042, 0044 (and 0043, 0045, 0046 for the final report), `docs/v0.6.0/release-notes.md` (the format to follow). Mostly docs and version strings, so little new code and almost no TDD surface. The existing `apps/server/src/version.test.ts` and the agent's `docker` tests are the only tests that bear on it. 8.3 needs Naresh for its manual half.

## Decisions taken while planning (flagged so you can object)
1. **No red tests for 8.1, 8.2 and 8.4** — they change docs and version strings, not behaviour. The gate is the full suite staying green. Stated in each log line.
2. **8.2 scope:** the five `package.json` files (root, `apps/web`, `apps/server`, `apps/agent`, `packages/shared`) from 0.6.0 to 0.7.0. `apps/agent/pyproject.toml` is `0.1.0`, not 0.6.0 (the scaffold), so it goes to `0.7.0` too, as the task says; `uv.lock` records the project version, so I'll run `uv lock` (no dependency change) and commit both. The server reads its version from the nearest `package.json` (`version.ts`), so nothing else needs to change; the README status line moves to 0.7.0.
3. **README vs CLAUDE.md length:** the README Configuration table gains `AGENT_SECRET`, `AGENT_URL`, `AGENT_TIMEOUT_MS`. I'll check the exact names and defaults in `config.ts` and the agent's `config.py` before writing, not from memory.
4. **8.3 is split.** I run everything automatable. The "with Naresh" list (three notes on the emptied vault, accept and reject, stale into Related, Re-run, Obsidian graph, fourth note linking back, agent stopped) is a manual script for you; I'll stop there and report, and won't tick 8.3 until you say it passed. The migration check runs on a copy of your real 0.6.0 database, which I need you to point me to (or a backup file); I never touch the live volume.
5. **Release date/tag:** release notes say "Not yet released", as 0.6.0's did. No tagging.

## 8.1 README and root CLAUDE.md (ADRs 0042, 0044)
Files: `README.md`, `CLAUDE.md` (root).
- **README**, in the existing style:
  - How it works: one sentence on linking after the summary (agent finds related notes and concepts, you accept or reject each link in review).
  - Requirements/Setup: `AGENT_SECRET` is required by compose; generate with `openssl rand -hex 32`; `docker compose up -d --build` now builds two images and the agent gets the vault read-only.
  - Using it: new review steps (Suggested links / Source tabs, Accept, Add to Related for stale or unanchored, Reject, Accept all, Reject all, Re-run linking with its confirm, Retry linking, Run linking, linking line in the summary info; the saved note keeps accepted links, rejected ones go nowhere).
  - Settings: a **Linking** subsection (agent status, Link notes automatically, Linking model with its Haiku default (ADR 0047), the linker prompt with history and reset, locked instructions).
  - API list: `GET …/link-suggestions`, `POST …/link-suggestions/accept|reject`, `POST …/linking`, and the new settings fields; the agent's own `/health`, `/v1/link`, `/v1/link/instructions` (internal, bearer secret).
  - Configuration: the new variables; running the agent outside Docker: `AGENT_SECRET=… VAULT_PATH=… ANTHROPIC_API_KEY=… pnpm --filter @mnemosyne/agent dev` (port 8100), with `AGENT_URL=http://localhost:8100` in `apps/server/.env`; needs `uv`.
  - Development: `pnpm -r test` now includes the agent; `uv run pytest -m docker` for its container tests.
  - Troubleshooting: "Settings says the agent isn't set up" (`AGENT_SECRET` empty), "Linking unavailable / skipped" (agent down: check `docker compose ps`, `docker compose logs agent`), "agent rejects the server" (secret differs between the two; it shows as the 401 message), a job showing "linking failed" (retry), suggestions marked Stale.
  - Roadmap: drop "Add `[[wikilinks]]`…"; add the PRD's out-of-scope items (concept stubs, bulk re-linking, tutor/validator endpoints).
- **Root `CLAUDE.md`**: add the linking step to the Architecture paragraph (after the summary the server calls the agent service over HTTP with the note and a bearer secret; the agent reads the vault read-only and returns suggestions; nothing is written to the vault until review; Express applies accepted links to the draft). Check the Folders table and rules already cover the agent (done in 1.1); no other edit.
- **Verify:** every file path, variable name and endpoint named in the README exists (grep against `config.ts`, routes, `config.py`); markdown links resolve; `pnpm -r lint` unaffected.
- No ADR; no TRD change.

## 8.2 Version 0.7.0
Files: the five `package.json`, `apps/agent/pyproject.toml`, `apps/agent/uv.lock`, `README.md` status line.
- Check first: `grep -rn "0\.6\.0"` and that nothing asserts the version (`version.test.ts` reads the file, so it follows). Note: the lines `"@mozilla/readability": "0.6.0"` in the server are a dependency and stay.
- Then `pnpm -r test|lint|typecheck`, `pnpm build`, `uv sync --frozen` (checks the lock matches).

## 8.3 Final checks
Automated (me):
- `pnpm -r test`, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm build` (shared built first: `pnpm --filter @mnemosyne/shared build`), `pnpm --filter @mnemosyne/web test:browser`; `uv run pytest`, `ruff check`, `pyright` in `apps/agent`.
- `cd apps/agent && uv run pytest -m docker` and `docker compose build`.
- Migration on a copy of the real 0.6.0 database: copy to the scratchpad, run the server's migrations against the copy (a short script or a throwaway server with `DATA_DIR` pointing at the copy and the agent unset), and assert version 7, existing jobs/feeds/profiles/settings unchanged, the seeded Linker profile with version 1, and that summary profile lists exclude it. I will not open the live Docker volume.
- Report the counts (shared 561, server ?, web 1181 + 22 browser, agent ?).
Manual (you, with me driving the app): the TRD list in `tasks.md` 8.3, in order, on the emptied vault with `docker compose up -d --build`. I'll write it as a numbered checklist in the report with what to expect at each step; the final item (agent container stopped) should show the note in review with Linking skipped/failed and Run linking available after restart.
- Any bug found goes in a new commit with a test first, not a retroactive edit. Anything outside the PRD/TRD/ADRs: stop and ask.
- Log line states what ran and what's pending Naresh; Status stays 🟨 until the manual half passes.

## 8.4 `release-notes.md`
Files: new `docs/v0.7.0/release-notes.md`, `docs/README.md` (v0.7.0 line with PRD · TRD · Tasks · Release notes · plans, marked done once 8.3 passes).
- Same sections as 0.6.0: New (agent service, linking, review, settings), Changes (API, `Job`/`Settings` fields, `JobStatus` `linking`, migration 7, env vars, ADR 0047's model default), Upgrading, Deferred, Known issues, Under the hood, Decisions (ADRs 0042–0047, noting 0047 changes TRD §6.5).
- Upgrading: (1) stop and back up the database (same `docker run … cp` as 0.6.0); (2) **wipe the vault first as planned** (say so plainly, with the reason: links only resolve against what's there); (3) add `AGENT_SECRET` (`openssl rand -hex 32`) to the root `.env`, compose fails without it; (4) `docker compose up -d --build`; migration 6 → 7 on start; (5) dev: `AGENT_SECRET`/`AGENT_URL` in `apps/server/.env`.
- Known issues: only ones I actually find; known gaps to check from the code: stale detection is text-only, linking skipped (not retried) while the agent is down, links only go into the new note, `AGENT_URL` unset disables linking.
- Test counts filled in from the 8.3 run.

## Commits
`docs(8.1): README and architecture for linking`, `chore(8.2): version 0.7.0`, `chore(8.3): final checks` (tasks.md log, and any fix as its own `fix(8.3): …`), `docs(8.4): release notes`. Each includes its `tasks.md` tick and log line; push after each. 8.3 and 8.4 may swap if 8.3 waits on you (release notes need its counts, so I'd finish 8.4's draft and leave counts for last).

## End of checkpoint
Stop and report per the root `CLAUDE.md`: tasks with hashes, test/lint/typecheck per folder (shared, server, web + browser, agent + docker), ADRs written (expect none beyond 0047) and that 0047 changes TRD §6.5, and anything deferred. Version 0.7.0 is then ready for you to tag.
