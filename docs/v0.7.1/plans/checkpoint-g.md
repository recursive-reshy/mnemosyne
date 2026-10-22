# Checkpoint G plan: Phase 9 (dependency refresh)

Next: checkpoint G, task 9.1. TRD §9, §10.1. Touches `package.json` files, `pnpm-lock.yaml`, `apps/agent/pyproject.toml` and `uv.lock`, the two Dockerfiles, and `tasks.md`. No app behaviour changes and no new dependencies. Gate for every task: tests, lint, typecheck and build for the folders touched, `test:browser` for web, and `pnpm e2e`. No ADRs are expected, except when a major needs one (TRD §9).

## 9.1 result: outdated table (run today, nothing changed)

| Package | App | Current | Latest | Kind |
| --- | --- | --- | --- | --- |
| @tanstack/react-query | web | 5.104.2 | 5.104.5 | patch |
| @vitest/browser-playwright (dev) | web | 5.0.4 | 5.0.5 | patch |
| jsdom (dev) | web | 30.1.2 | 30.1.3 | patch |
| react, react-dom | web | 19.3.0 | 19.3.1 | patch |
| @mui/x-tree-view | web | 9.15.0 | 9.16.0 | minor |
| react-router | web | 8.4.0 | 8.5.0 | minor |
| vitest (dev) | server, shared, web | 5.0.4 | 5.0.5 | patch |
| eslint (dev) | e2e, server, shared, web | 10.12.0 | 10.13.0 | minor |
| typescript-eslint (dev) | e2e, server, shared, web | 8.71.2 | 8.72.0 | minor |
| @anthropic-ai/sdk | server | 0.133.0 | 0.137.0 | minor (0.x; the `^0.133.0` range doesn't reach it, so the range moves) |
| fastapi | agent | 0.156.4 | 0.159.1 | minor (0.x; `>=` range, `uv lock --upgrade-package`) |
| typescript (dev) | e2e, server, shared, web | 6.0.3 | 7.0.2 | **major, held** |
| @types/node (dev) | e2e, server, shared, web | 24.19.2 | 26.6.5 | **major** |
| anthropic | agent | 1.17.0 | 2.1.0 | **major** |

Not listed, so already current: the exact-pinned `@googleapis/gmail`, `@mozilla/readability`, `feedsmith`, `linkedom`, `turndown`; `@mdxeditor/editor`; uvicorn, pyright, pytest, ruff. (The Python 3.14 hold and `uv` 0.12.13 are checked in 9.5.)

Decisions from the table:
- **TypeScript 7: held** (ADR 0010). typescript-eslint 8.72.0, the latest, has peer range `typescript >=4.8.4 <6.1.0`, so it doesn't support 7. No question to ask.
- **@types/node 26: skip.** The runtime is `node:24-slim`; types for Node 26 would describe APIs the runtime lacks. Stay on `^24` (24.19.2 → latest 24.x in 9.2/9.3). Needs Naresh's yes.
- **anthropic (Python) 2.x: its own task, 9.6.** The server's SDK is 0.x and gets the minor bump in 9.2.

## Tasks

**9.1: outdated table.** Create `docs/v0.7.1/plans/checkpoint-g.md` holding the table above and these decisions (this file's content, saved after approval). Re-run `pnpm -r outdated` and `uv tree --outdated` first in case a release landed overnight. No code changes. Tick 9.1 and add the log line; one commit with the plan (`docs(plan): checkpoint G`, tick the Plan cell) and one for `feat`-less `docs(9.1)`: or both in the first commit, as earlier checkpoints did.

**9.2: shared and server.** `pnpm up` for the minor/patch packages in these two apps: vitest, eslint, typescript-eslint, `@types/node` (within 24) in both; `@anthropic-ai/sdk` `^0.133.0` → `^0.137.0` in server. Red path: none (no new behaviour); the check is that the existing suites stay green. If the SDK minor changes a type in `claude.client.ts` / `anthropicModels.client.ts` and the fix is more than ~30 lines, stop and ask. Then `pnpm --filter @mnemosyne/shared build` before the server typecheck (as before). Gate: shared and server tests, lint, typecheck, build. Commit `chore(9.2): …`.

**9.3: web and e2e.** react, react-dom, @tanstack/react-query, react-router, @mui/x-tree-view, jsdom, vitest, @vitest/browser-playwright, eslint, typescript-eslint (and `@types/node` within 24 in both). Playwright stays 1.64.1 (not outdated; web and e2e must keep the same version). Watch the MDXEditor round-trip tests (ADR 0023); if an upgrade breaks them, stop and ask. Gate: web unit, `test:browser`, lint, typecheck, build; e2e lint, typecheck, fakes tests; `pnpm e2e`. Commit `chore(9.3): …`.

**9.4: agent.** `uv lock --upgrade-package fastapi` (the other packages are already latest; `anthropic` stays on 1.x by an explicit upper bound check: confirm `uv lock --upgrade` doesn't jump to 2.x because `anthropic>=1.17.0` has no cap, and if it would, add `<2` in this task and remove it in 9.6). Raise the `fastapi>=` floor to the new version only if the lock file needs it. Gate: `pytest` (including the `docker` tests), `ruff check` without `--fix`, `pyright`. Commit `chore(9.4): …`.

**9.5: base images and `uv` pin.** Record `docker images` sizes for `mnemosyne:local` (1.14 GB) and `mnemosyne-agent:local` (306 MB) before; `docker compose build --pull`; check the current `node:24-slim` and `python:3.14-slim` patch (the Dockerfiles use floating tags, so TRD §9's "at their current patch" is satisfied by the pull; note the digests or versions in the log line); check the latest `uv` release and bump `ghcr.io/astral-sh/uv:0.12.13` in `apps/agent/Dockerfile` if newer (the local `uv` is 0.12.13, so I'll check ghcr or GitHub releases). Sizes after in the log line. Gate: `docker compose build`, agent `docker` tests, `pnpm e2e`. Commit `chore(9.5): …` (if nothing changes, the commit is just the log line).

**9.6 (added by 9.1): `anthropic` 1.17.0 → 2.x in `apps/agent`.** Read the SDK's v2 changelog first. Failing tests first where behaviour is touched (`claude.py`, `linker/loop.py`; tests with fake clients); least code to pass. Stop and ask if it needs more than about 30 lines of changes (TRD §9); the decision becomes ADR 0054. Gate as 9.4, plus `pnpm e2e` (the linker runs against the fake Anthropic API). Commit `chore(9.6): …`.

No other majors are added: TypeScript 7 is held and `@types/node` 26 is skipped.

## Order and cautions
- 9.1 → 9.2 → 9.3 → 9.4 → 9.5 → 9.6, one commit each, pushed after each. `tasks.md` gets a Status tick and a log line per task, 9.6 added to the table in the 9.1 commit.
- Docker must be running for `pnpm e2e` and the image builds. `pnpm e2e` uses its own image names, so the real `mnemosyne:local` isn't retagged by it, but 9.5's `docker compose build` will rebuild the real images (no containers are restarted).
- If any upgrade makes a test fail for a reason that isn't a clear API rename, stop and report instead of editing the test.

## Verification
Per task: the gate above, all green, with counts in the log line. At the end of the checkpoint: `pnpm -r outdated` and `uv tree --outdated` show only the held items (TypeScript 7, `@types/node` 26), then the checkpoint report (tasks with hashes, results per folder, `pnpm e2e`, ADRs, deferred items).

## Decisions (approved)
- `@types/node` 26 is skipped; stay on `^24` to match `node:24-slim`.
- 9.6 is added for the `anthropic` 2.x major.
