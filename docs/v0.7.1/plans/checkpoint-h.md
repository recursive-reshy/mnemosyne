# Checkpoint H plan: Phase 10 (clean-up and release)

Next: checkpoint H, task 10.1. ADRs 0048–0053 (10.4: 0051). Docs and version strings only, with Naresh-run checks in 10.3. No app behaviour change, no new dependency, no new ADR expected. TDD has nothing to drive here (no code); each task's "red" is a grep or check that fails first (noted below). Gate after each task: `pnpm lint` and `pnpm typecheck` for anything touched (10.2 touches `package.json` files, so run tests too).

State found: README already has `BACKUP_HOST_PATH` in Setup, the `BACKUP_DIR` row and a Back-up-now line (task 7.5). `docs/backups.md` exists. `.env.example` already lists `LOG_LEVEL`, `STATUS_CHECK_INTERVAL_MINUTES`, `BACKUP_HOST_PATH`. All six `package.json` files (root, shared, server, web, agent, e2e) and `apps/agent/pyproject.toml` are at 0.7.0. v0.7.0 keeps its release notes at `docs/v0.7.0/release-notes.md`, so v0.7.1 uses `docs/v0.7.1/release-notes.md`.

## 10.1 README and root CLAUDE.md
Files: `README.md`, `CLAUDE.md` (root).
Before: read ADRs 0048–0053 and `docs/backups.md` so the text matches; check the real e2e port (3101) and `run.sh`.
README edits (match its existing dense paragraph style):
- **Intro / How it works:** one sentence each for the status panel, manual backups and the job lifecycle; no change to the flow.
- **Settings section:** rewrite "The gear … opens Settings. The Summarizer section has:" for three tabs (Prompts: list + editor, linker prompt, locked instructions, address carries the selected prompt; Models: summary model, linking model and switch; Sources: Status panel, feeds, Gmail). Fix "Linking. Shows whether the agent service is reachable" (that moved to Status) and "switching profile … asks first" (now the guard on tab and prompt switches). Add a **Status panel** bullet: rows, OK/Failing/Off, last 5 errors, Reconnect, background check every `STATUS_CHECK_INTERVAL_MINUTES`, drawer warning badge. Add a **Backups** bullet pointing to `docs/backups.md` (key never in the backups folder).
- **Configuration:** add `LOG_LEVEL` and `STATUS_CHECK_INTERVAL_MINUTES` rows; one bullet on logs (JSON lines, job ID on every job line and passed to the agent, `docker compose logs mnemosyne | grep <job id>`, no secrets or note text).
- **Development:** add `pnpm e2e` (needs Docker; builds the stack against local fakes, tears it down; run at the end of a checkpoint and before a release).
- **API paragraph:** add a 0.7.1 sentence: `GET /api/status`, `POST /api/status/refresh`, `GET /api/status/:kind/:id/errors`, `POST /api/backups`.
- **Troubleshooting:** add entries: a Failing row (open it for the last 5 errors); drawer badge; "newer version of Mnemosyne" refusal at startup (restore an older backup or upgrade); `BACKUP_HOST_PATH` unset (Compose refuses); Back up now fails; Gmail key lost (reconnect); following a job in the logs. Fix the existing whisper and agent entries that say Settings shows agent status.
- **Status and roadmap:** left for 10.2.
Root `CLAUDE.md`: add to the Architecture paragraph one sentence each: lifecycle table in `apps/server/src/jobs/lifecycle.ts` that `moveTo` enforces (ADR 0048); structured logs with job ID across server and agent (0049); the Status panel and `health_status` (0050); manual backups to `/backups` and the newer-database refusal (0051); Settings tabs (0052). "Folders" table already lists `e2e/`. Keep "current version" line for 10.2.
Red: `grep -n "STATUS_CHECK_INTERVAL_MINUTES\|pnpm e2e\|/api/status\|LOG_LEVEL" README.md` shows gaps before, none after. Check every link/path named exists.
Commit: `docs(10.1): README and architecture paragraph for 0.7.1`.

## 10.2 Version 0.7.1
Files: `package.json`, `packages/shared`, `apps/server`, `apps/web`, `apps/agent` (`package.json` and `pyproject.toml`), `e2e/package.json`, `README.md` status line ("Version 0.7.1 …"), plus `uv.lock` if it records the agent's own version (regenerate with `uv lock`, not `--upgrade`). Root `CLAUDE.md` already says 0.7.1.
Red: `grep -rn '"version": "0.7.0"'` and `version = "0.7.0"` list 7 hits; zero after.
Gate: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` (a version change shouldn't break any, but a test may read it; if one does, stop and report). Commit: `chore(10.2): version 0.7.1`.

## 10.3 Final checks (split: mine, then Naresh's)
Mine, in order: `pnpm test` (all packages incl. pytest), `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm --filter web test:browser`, `cd apps/agent && uv run pytest -m docker`, `docker compose build`, `pnpm e2e`. Record counts in the log line. Any failure: stop and report, no test edits.
With Naresh (I give the commands, he runs or confirms; I don't touch the real volume, containers or `.env`): (1) with 0.7.0 still running, copy the real database out of the volume as a backup; (2) run migration 8 on a copy of it and check the feed/source rows carried over (a small `node` one-liner against the copy using the built server's `openDatabase`); (3) in Docker after `docker compose up --build` with `BACKUP_HOST_PATH` set: Settings tabs and the unsaved-edits guard; Status panel with the agent stopped (`docker compose stop agent`) and whisper-server stopped (`launchctl bootout`), badge count; **Back up now** and the file in the folder; the restore drill from `docs/backups.md`; follow one job by ID through `docker compose logs`.
These live steps need his machine, so 10.3 stays 🟨 until he reports; I tick it with his results in the log line. If a step fails, stop and report (a fix is a new task, asked first).
Commit: `docs(10.3): final checks` (the tick and log line only).

## 10.4 Release notes
Files: new `docs/v0.7.1/release-notes.md`, `docs/README.md` (link on the v0.7.1 line, set "(in progress)" → "(done)" only if Naresh agrees at the report, mirroring v0.7.0's line).
Content, in v0.7.0's shape: summary; **New** (Settings tabs and Prompts layout, Status panel and badge, Back up now, structured logs, e2e); **Changes** (lifecycle table enforced, ADR 0048 corrections to the TRD, migration 8 moves `last_checked_at`/`last_error` into `health_status`, `BACKUP_HOST_PATH` now required by Compose, new env vars, refusal of a newer database, dependency refresh: fastapi, anthropic 2.x, uv 0.13.5, TypeScript 7 and `@types/node` 26 held); **Upgrading** (back up the database first, using the 0.7.0 volume-copy command; add `BACKUP_HOST_PATH` to `.env` and create the folder; `docker compose up -d --build`; rollback via backup, noting migration 8 isn't reversible so 0.7.0 would be refused by nothing — restore the pre-upgrade copy); **Known follow-ups** (the server tests that reach the real Anthropic API with the test key, noted in 3.2; anything 10.3 finds).
Red: link check — `grep -n release-notes docs/README.md` for v0.7.1 empty before.
Commit: `docs(10.4): release notes`.

## Housekeeping per task
Tick Status in `tasks.md`, add a log line, commit by file name, push. Plan commit first: save this file to `docs/v0.7.1/plans/checkpoint-h.md`, tick the Plan cell (`✅ [plans/checkpoint-h.md](plans/checkpoint-h.md)`), commit `docs(plan): checkpoint H`, push.

## Open point for Naresh
Release notes and the v0.7.0 "not yet released" pattern: should the notes say "Not yet released" with the date and tag left to you, as 0.7.0 did? Plan assumes yes, and that I don't tag.

## End-of-checkpoint report
Tasks with hashes; results per folder plus `pnpm e2e`; ADRs (none expected); deferred items.
