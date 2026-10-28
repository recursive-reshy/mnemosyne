# Checkpoint A plan: Phases 1–3 (kick-off, learning root, Obsidian link)

Saved on approval to `docs/v0.9.1/plans/checkpoint-a.md`; tick the Plan cell in `tasks.md`; commit `docs(0.9.1-plan): checkpoint A`; push; then start 1.1.

## Context
0.9.1 is a patch: no schema change, no new dependency, no new endpoint. Checkpoint A fixes two things from 0.9.0 manual testing: a new learning root can't be created from Settings (ADR 0072), and "Open in Obsidian" uses one app-wide vault name. ADRs read: 0054, 0072, 0053, 0063.

Commit scope for every task: `feat(0.9.1-<id>): …` (the task's own commit also ticks Status and adds a log line in `tasks.md`; after each task run test, lint, typecheck for the folders touched). Co-Authored-By line per the session attribution.

## 1.1 Version 0.9.1
- Files: `package.json`, `e2e/package.json`, `apps/{web,server,agent}/package.json`, `packages/shared/package.json` (all `0.9.0` → `0.9.1`); `apps/agent/pyproject.toml` line 3; `apps/agent/uv.lock` entry `mnemosyne-agent` (line 229); README status line (find the version mention; the intro paragraph says "Version 0.8.0 added Melete", so check whether a 0.9.0 status line exists and bump it, otherwise add none). `docs/README.md` already lists v0.9.1 and ADR 0072 (confirm only).
- Tests first: none exist for versions; verify by grep that no `0.9.0` remains in those files, and that `uv lock --check` / agent tests still pass (edit uv.lock by hand, don't re-resolve).
- Red → green: grep shows 0.9.0 → grep clean. Run `pnpm test`/lint/typecheck for server, web, shared and the agent's tests.

## 2.1 `resolveFolder` for the learning root (ADRs 0054, 0072)
Tests first (all red before code):
- `vault.client.test.ts`: `resolveFolder` with a regular file where the folder should be (and a file as a parent segment → `ENOTDIR`) rejects with `ValidationError` 400 "A file is in the way of folder "<path>"". Today: raw `EEXIST`/`ENOTDIR` escapes.
- `settings.service.test.ts`: PATCH a new `melete_learning_root` → folder created in the user's vault and setting stored, scan clock reset; existing folder accepted; outside-vault path → 400; file in the way → 400. The existing "doesn't exist" expectation flips.
- `settings.routes.test.ts`: same through the route (200 creating, 400 for file / outside).
- Guard test (new, e.g. `resolveFolder.guard.test.ts` beside the other guard test): reads `apps/server/src` sources; only `clients/vault.client.ts` (definer, via `writeNote`) and `services/settings.service.ts` import `resolveFolder`; nothing under `melete/` or `services/melete*.ts` does. Currently red? It passes except settings isn't yet an importer; write it asserting the allow-list, so it stays green after the change and fails on a Melete import.
Code:
- `clients/vault.client.ts` `resolveFolder`: wrap `mkdir` in try/catch, map `EEXIST`/`ENOTDIR` to `ValidationError`; rethrow others. Update the comment above `resolveExistingFolder`.
- `services/settings.service.ts:14,232`: import and call `resolveFolder` instead of `resolveExistingFolder` (remove the unused import if nothing else uses it).
Green: the new tests pass; review-screen save tests unchanged.

## 2.2 Web and e2e
- `LearningRootSetup.test.tsx`: add a case where choosing **New folder** sends that path to `updateSettings` (expected to pass already since no code change; confirm it fails if the path were dropped by temporarily asserting the exact payload, i.e. it is a characterization test, noted in the log).
- `e2e/tests/melete.spec.ts` (line ~8–13): set the learning root via **New folder** in the dialog, then assert the folder exists under the e2e vault (e2e vault path is available to the spec through the existing helpers/Compose volume; check `signedIn.ts` for how other specs read the vault). Keep the rest of the spec's flow on the existing `Learning` folder.
- Run `pnpm e2e` at the end of the checkpoint.

## 3.1 `vaultDirFor( userId )` (ADR 0063)
Tests first:
- `vault.service.test.ts`: returns the user's `vault_dir`, `null` when none; no `lstat`.
- `melete.service.test.ts` (around line 498) and `meleteReview.service.test.ts` (line 362), `melete.routes.test.ts` (line 439): replace the `configMock.obsidianVaultName` setup with users that have `vault_dir`; add a two-user test: same note path, two different `obsidian_url`s (`obsidian://open?vault=<dir>&file=…`); user without vault → `null`.
Code:
- `services/vault.service.ts`: `export const vaultDirFor = ( userId ) => findUserById( userId )?.vault_dir ?? null`.
- `services/melete.service.ts:105` and `services/meleteReview.service.ts:147`: `obsidianUrl( vaultDirFor( userId ), note.path )`; drop now-unused `config` imports. `melete/obsidian.ts` unchanged.
(Until 3.2, `config.obsidianVaultName` still exists but is unread; tests stop touching it.)

## 3.2 Retire `OBSIDIAN_VAULT_NAME`
Tests first: `config.test.ts`: `ignoredEnv` reports `OBSIDIAN_VAULT_NAME` when set, not when empty; remove the `obsidianVaultName` expectations (lines 51, 78, 112, 305–313) and the `obsidianVaultName` mocks in the Melete tests from 3.1.
Code: `config.ts` drop the schema entry (line 140) and `obsidianVaultName` (177); add `'OBSIDIAN_VAULT_NAME'` to `IGNORED_VARIABLES` (line 106). Remove from `.env.example` (line 50) and `apps/server/.env.example` (line 67); e2e Compose override doesn't set it (checked). README: variables table row (192), phone step (120), Melete variables note (201), troubleshooting entry (284: now "The link opens the wrong vault" → Obsidian names a vault after its folder; a person who opened a parent folder gets a link Obsidian doesn't know). `apps/server/CLAUDE.md` line 43: drop the variable and `config.obsidianVaultName`, say the link uses the user's `vault_dir`.

## Checkpoint end
Report per CLAUDE.md: tasks with commit hashes; test, lint, typecheck, build per folder (server, web, shared, agent); `pnpm e2e` result; ADRs (0072 amends 0054, no TRD change); deferred items. Web screens aren't changed in A, so no screenshots needed (LearningRootSetup unchanged in code).
