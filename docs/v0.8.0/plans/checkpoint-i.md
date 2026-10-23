# Checkpoint I plan: Phase 10, clean-up and release (tasks 10.1–10.4)

## Context
Checkpoints A–H built Melete. Checkpoint I is docs, version and release checks: no feature code, no new dependency, no contract change, no ADR expected (0054–0060 cover it). Save this as `docs/v0.8.0/plans/checkpoint-i.md` once approved.

Findings: 0.7.1 appears in 7 `package.json` files (root, `packages/shared`, `apps/web`, `apps/server`, `apps/agent`, `e2e`), `apps/agent/pyproject.toml:3`, `apps/agent/uv.lock:229` and `README.md:258`. README has no Melete text yet (only the phone-access link at line 72). `docs/phone-access.md` exists. `docs/v0.7.1/release-notes.md` is the format model. Docs-only tasks have no failing test; 10.2 is guarded by a grep check (see below).

## 10.1 README and root CLAUDE.md (ADRs 0054–0060)
Files: `README.md`, `CLAUDE.md`.
- README intro and **How it works**: add Melete (a second module: study notes from a learning root, questions, spaced review) and note the app is now localhost-only with phone access via Tailscale.
- README **Using it**: new subsection **Melete** — learning root (a vault folder; its direct child folders are subjects; chosen on the Today page), subjects (auto-enroll, new questions per day), enrollment of notes (per note or **Enroll all**), question generation and regeneration after an edit, Typed vs Quick review modes, the rating bar and keys 1–4/Enter, Today counts, moving a note keeps its history, Melete never writes to the vault. **Study** profile and **folder memory** (picker starts on the last folder used with that profile) under the summary steps / Settings. Settings: Melete prompts (Prompts tab) and Question/Grading models (Models tab).
- README **Configuration**: table rows and bullets for `OBSIDIAN_VAULT_NAME`, `APP_TIME_ZONE`, `MELETE_DAY_START_HOUR`, `MELETE_REQUEST_RETENTION`, `MELETE_GRADING_TIMEOUT_MS`, `MELETE_GENERATION_TIMEOUT_MS` (defaults from TRD §1/§9.3; check `config.ts` and `.env.example` so the doc matches the code). Endpoints paragraph: add the `/api/melete/*` routes and `default_folder`.
- README **Troubleshooting**: learning root "Folder doesn't exist in the vault"; no subjects shown; note stuck on Failed or "too long" (60 000 characters); grading "Couldn't grade this one"; Open in Obsidian missing without `OBSIDIAN_VAULT_NAME`; phone can't reach the app (link to the guide); port now localhost-only.
- Root `CLAUDE.md`: add Melete to the intro/architecture paragraph (module of the same server/web/DB, `melete_*` tables, FSRS via `ts-fsrs`, generator loop, review modes, Study profile and folder memory, read-only on the vault, phone access) and to the folders table where it fits (`apps/server`, `apps/web` rows mention Melete; `ops/`/`docs/` unchanged). Keep to what is true everywhere; app detail stays in the app `CLAUDE.md` files. Root `CLAUDE.md` says "current version 0.8.0" already.
- Check: every link target exists (`grep`/`ls`), env names match `.env.example`.
- Gate: docs only, but run `pnpm lint` if it covers Markdown; otherwise none. Commit `docs(10.1): Melete in README and CLAUDE.md`.

## 10.2 Version 0.8.0
Files: root `package.json`, `packages/shared`, `apps/web`, `apps/server`, `apps/agent` `package.json`, `e2e/package.json`, `apps/agent/pyproject.toml`, `apps/agent/uv.lock` (the `mnemosyne-agent` entry, line 229), `README.md` status line (258).
- Red check first: `git grep -n '0\.7\.1'` outside `docs/` and lockfile noise lists exactly those places; also grep source for anything reading the package version (health endpoint, backups' "newer version" guard, manifest) and any test pinning "0.7.1". After the edit the same grep returns nothing outside `docs/`.
- Edit by hand (no `pnpm version`, no `uv lock` that could change other pins); then `pnpm install --frozen-lockfile` and `uv lock --check` (agent) to prove the lockfiles still agree.
- Gate: tests, lint, typecheck for shared, server, web; agent `uv` lint/tests (non-docker); e2e lint. Commit `chore(10.2): version 0.8.0`.

## 10.3 Final checks (part automated, part with Naresh)
Automated by me, in order, recorded in the log with counts: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, web `test:browser` (Chromium and WebKit), the agent's `docker` tests, `docker compose build`, `pnpm e2e`. Any failure: stop and report, fix in a new commit.
Manual steps need Naresh and his real data, so I stop and ask rather than do them: back up the real 0.7.1 database and run migration 9 on a copy; in Docker set the learning root, make a subject folder in Obsidian, summarize a video with Study (picker remembers the folder on the next one), enroll, review on the phone over Tailscale from the home-screen icon in both modes, edit a note in Obsidian and see its questions regenerate, move a note and keep its history. I will give him this list as a checklist in the report. 10.3 is ticked with the automated results and the log line says which manual items Naresh confirmed; if he hasn't run them yet, the task stays 🟨 and 10.4 still gets written (it only needs the facts).
Commit `chore(10.3): final checks` (tasks.md only).

## 10.4 Release notes (ADR 0060)
Files: `docs/v0.8.0/release-notes.md` (new), `docs/README.md` (link; v0.8.0 entry goes from "in progress" to "done" only after 10.3 is complete, otherwise just add the link).
- Format of `docs/v0.7.1/release-notes.md`: summary paragraph; **New** (Melete, Study profile, folder memory, installable app and phone access); **Changes** (port localhost-only, migration 9 can't be undone, `ts-fsrs`, new variables, `default_folder`, `GetMeleteNoteResponse.obsidian_url`, `/api/prompt-profiles?purpose=`); **Upgrade steps**: back up the database first (Back up now), optional `OBSIDIAN_VAULT_NAME`, `docker compose up -d --build`, port now `127.0.0.1` only (use the phone-access guide), rollback = restore the backup.
- Facts come from the task log and ADRs; the TRD changes noted in the log (§2.1/§10 note response; §8 migration seeding; `resolveExistingFolder`; `existingFolderSync`) go in a short "Differences from the TRD" list for the checkpoint report, not the notes.
- Commit `docs(10.4): v0.8.0 release notes`.

## Per task
Tick Status, add a log line in `tasks.md`, one commit each, stage files by name, push. Tick the Plan cell for checkpoint I (⬜ → ✅) and commit `docs(plan): checkpoint I` as the first step after approval.

## End of checkpoint
Report per root `CLAUDE.md`: tasks with hashes; test/lint/typecheck per folder, `test:browser`, agent docker tests, `pnpm e2e`, `docker compose build`; ADRs (none); TRD deviations collected from the log; the manual 10.3 checklist and what Naresh has or hasn't confirmed. Stop; no further checkpoint exists.

## Points for approval
1. 10.3's manual steps need Naresh; I stop for them rather than tick them myself.
2. Version bump by hand-edit plus `--frozen-lockfile` / `uv lock --check`, not by version tooling.
