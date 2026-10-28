# Checkpoint G plan: Phase 8 (e2e, docs and release)

## Context
Checkpoints A–F built multi-user Mnemosyne: Google sign-in, ownership, per-user vaults, loops, admin and the web gate. What is left is proving it end to end, documenting it and releasing 0.9.0 (ADRs 0053, 0061–0068; TRD §10, §11.4, §12). Five tasks, one commit each (`feat|docs|chore(0.9-8.x): …`, co-author trailer), pushed. `pnpm e2e` has been failing since 3.6 (nothing can sign in); 8.1 fixes that. 8.4 has manual steps that need Naresh.

Gate per task: tests, lint and typecheck for every folder touched (server for 8.1; docs-only tasks run `pnpm lint` where markdown or package files change). `pnpm e2e` after 8.1 and in 8.4. No new dependency.

## Decisions (flag if you disagree)
1. **`NODE_ENV` guard.** The Dockerfile sets `NODE_ENV=production`; nothing in `apps/server/src` reads it today. The e2e Compose override sets `NODE_ENV: test` plus `E2E_TEST_SIGNIN: "1"` on the `mnemosyne` service. Config reads `E2E_TEST_SIGNIN` (`config.e2eTestSignin`), and `server.ts` refuses to start when it is set and `NODE_ENV !== 'test'` (TRD §11.4). Vitest already runs with `NODE_ENV=test`, so the route unit tests need no env trick; the absence test mocks config.
2. **Route placement.** `routes/testSession.routes.ts` is mounted in `app.ts` only when `config.e2eTestSignin` is true, before `requireUser` (it creates the session), after `jsonOnly`. `POST /api/test/session { email, role?, modules?, vault_dir? }`: finds or creates the user (admin when the email equals `ADMIN_EMAIL`, else member with the given modules, default none), runs `seedUser`, binds `vault_dir` if given and the folder exists, creates a session with `createSession` and sets the cookie with `cookieOptions`. Reuses `insertUser`, `setModules`, `setVaultDir`, `seedUser`, `createSession`, `cookieOptions`. The `vault_dir` is not required to pass the claim races of 5.2; the e2e vaults exist from `run.sh`.
3. **Signed-in specs.** Playwright gets a `globalSetup`-free approach: a fixture `e2e/tests/signedIn.ts` extends `test` so `page` and `request` contexts are signed in as the admin by calling `POST /api/test/session` once per test (storage state would also work, but a per-test call keeps specs independent). Admin session uses `vault_dir: 'admin'` (run.sh already creates `admin` and `member` folders under the temp vaults dir and passes `E2E_VAULT_DIR`).
4. **`multi-user.spec.ts`** (TRD §11.4): sign in as `member@e2e.test` with Melete only and no vault → ChooseVault shows (claims `member` from the list) → drawer shows Melete, not Transcriber or Admin → `/` redirects to `/melete` → admin's job ID (created by the admin via API in the same spec) is a 404 for the member → the Settings Admin tab is absent. Runs under the desktop project.
5. **Docs scope for 8.2.** README is rewritten where it says single user / no accounts / `VAULT_PATH` / `GOOGLE_REDIRECT_URI` (Setup, Google Cloud, Configuration table, Troubleshooting, Status line, API list for `/api/auth`, `/api/me`, `/api/admin`). Root `CLAUDE.md` gets the multi-user architecture paragraph (sign-in, sessions, ownership, vaults, loops, admin) and the folders table gets nothing new except `e2e/` wording. `docs/phone-access.md` loses "There is no login" and the Gmail-from-localhost-only caveat (Gmail redirect is now per origin, ADR 0061 / task 4.3).
6. **Version bump (8.3)** touches every `package.json` (root, server, web, agent, shared, e2e if it has one), `apps/agent/pyproject.toml`, the `mnemosyne-agent` entry in `apps/agent/uv.lock`, and the README status line. `pnpm install --lockfile-only` is not needed (workspace versions are not in `pnpm-lock.yaml`); verify with `pnpm install --frozen-lockfile` and `uv lock --check`.
7. **8.4 split.** I run the automated half (all tests, lint, typecheck, build, browser tests, agent `uv run pytest` + `pytest -m docker`, `pnpm e2e`, `docker compose build`) and report. The manual half (moving the vault, upgrade, real Google sign-in, brother on Tailscale, isolation by hand, iPhone home-screen sign-in per TRD §9.6) is a checklist Naresh does; I tick 8.4 only when they confirm, otherwise leave it 🟨 and log what passed. The Tailscale forwarded-header check from 3.3 and the Obsidian-link question (`obsidianVaultName` is global, 5.1) are on that list.
8. **Open follow-ups to surface in the report, not fix here:** the flaky shared `/tmp/mnemosyne-test-vaults` (6.1 log), and `obsidianUrl` using one global vault name. Neither is in G's task list. Say if you want either fixed inside G.

## 8.1 Test sign-in route and e2e specs
- **Tests first (red):**
  - `routes/testSession.routes.test.ts`: with the flag on, `POST /api/test/session` creates the admin for `ADMIN_EMAIL` (cookie set, `/api/me` works with it, `role: admin`); creates a member with the given modules and vault (`/api/me` shows them); is idempotent for an existing user (updates modules, one user row); a `vault_dir` that does not exist is 400; bad body is 400.
  - `app.test.ts` (or `testSession.absent.test.ts`): with the flag off the route is a 404 like any unknown `/api` path.
  - `config.test.ts`: `E2E_TEST_SIGNIN` parsed; `assertTestSigninAllowed( env )` (pure function in `config.ts` or `server.ts`-adjacent module so it is testable) throws when the flag is set and `NODE_ENV` is not `test`, passes otherwise.
- **Code:** `config.ts` (`e2eTestSignin`), `routes/testSession.routes.ts` + controller (thin), `app.ts` conditional mount, `server.ts` guard call, `e2e/docker-compose.e2e.yml` (`NODE_ENV`, `E2E_TEST_SIGNIN`), `e2e/tests/signedIn.ts` fixture, existing specs (`article`, `feed`, `home`, `melete`, `status`) switched to it, new `multi-user.spec.ts`, `e2e/run.sh` comment update. `apps/server/CLAUDE.md` Environment gets `E2E_TEST_SIGNIN` (test only). `.env.example` does **not** list it (it must never be set for real).
- **Red → green:** route tests fail with 404 / missing module → pass after the route; `pnpm e2e` fails on sign-in before the fixture and passes after.
- **Run:** server test/lint/typecheck/build, then `pnpm e2e` (needs Docker).
- **Commit:** `feat(0.9-8.1): test sign-in route and multi-user e2e`.

## 8.2 Docs
- `docs/google-cloud-setup.md` (new, TRD §10): create project, enable Gmail API, branding, audience External (note: Testing mode is fine for sign-in alone, but Gmail refresh tokens then expire in 7 days, so publish as In production, and add every user as a test user while in Testing), scopes `openid email profile` plus `gmail.readonly`, redirect URIs for every origin in `APP_ORIGINS` for **both** `/api/auth/callback` and `/api/gmail/oauth/callback` (Docker `http://localhost:3100`, dev `http://localhost:5173`, the Tailscale `https://…ts.net`), `.env` values. README's Gmail section shrinks to a pointer.
- `docs/phone-access.md`: add the Tailscale address to `APP_ORIGINS`, sharing the node/inviting the second person, the sign-in step, home-screen app signs in on its own (flagged "verify in 8.4"), remove "There is no login" and the Gmail-from-localhost caveat.
- `README.md`: intro and status (multi-user, 0.9.0 wording lands in 8.3), Requirements/Setup (`ADMIN_EMAIL`, `APP_ORIGINS`, `VAULTS_HOST_PATH` and the vaults folder layout, `SESSION_DAYS`), Using it (sign-in, choosing a vault, modules, Settings → Admin: add/remove/restore/reset vault/delete, usage), Configuration table (added and removed variables), Troubleshooting (not-allowed page, "Choose your vault first", unknown origin 400, agent says unknown vault, upgrade set-aside file), API list (`/api/auth/*`, `/api/me*`, `/api/admin/*`).
- Root `CLAUDE.md`: first-paragraph check, architecture paragraph (users, sessions, ownership rule, vault per user, shared loops with round-robin, admin/usage, set-aside baseline), folders table, `v0.9.0` references stay. Other `CLAUDE.md`s were updated in their own tasks; grep them for `VAULT_PATH`, "single user", `GOOGLE_REDIRECT_URI`.
- **Tests:** none to write; a grep check that no doc still mentions `VAULT_PATH`, `VAULT_HOST_PATH` or `GOOGLE_REDIRECT_URI` except in the release notes' "removed" list and the `ignoredEnv` note.
- **Commit:** `docs(0.9-8.2): multi-user docs and Google Cloud setup`.

## 8.3 Version 0.9.0
- Change `0.8.0` → `0.9.0` in the six `package.json` files, `apps/agent/pyproject.toml`, `apps/agent/uv.lock` (`mnemosyne-agent`), README "Status and roadmap" line (now multi-user, not "a single-user tool"). Check whether the server reports a version anywhere (`/api/health`, web footer) with a grep and update its test if so.
- **Test first:** if a test asserts the version, change it first and watch it fail; otherwise the check is `grep -rn '0\.8\.0'` before/after and `uv lock --check`, `pnpm install --frozen-lockfile`.
- **Commit:** `chore(0.9-8.3): version 0.9.0`.

## 8.4 Final checks (automated half by me, manual half with Naresh)
- Automated: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` (server, web, shared); `pnpm test:browser` in web; `uv run pytest`, Ruff, Pyright and `pytest -m docker` in the agent; `pnpm e2e`; `docker compose build`. Fix anything red in a new commit.
- Manual checklist (TRD §12 and §9.6): move the vault to `~/Vaults/<name>`; rename `VAULT_HOST_PATH` to `VAULTS_HOST_PATH`; set `ADMIN_EMAIL` and `APP_ORIGINS`; add redirect URIs in Google Cloud; `docker compose up -d --build` and confirm the `pre-0.9-<stamp>.db` copy; sign in as admin, choose the vault; add the brother, add him as a Google test user, sign in from another device over Tailscale, claim or create his vault; check isolation by hand (his job/note IDs 404 for you and vice versa); toggle modules; check usage; confirm the Tailscale forwarded origin resolves (3.3); iPhone: install the home-screen app and sign in from it. If the iPhone session does not land in the installed app, stop and ask (a device sign-in code flow would be an ADR).
- Log line records each automated result and which manual items Naresh confirmed. 8.4 stays 🟨 until he confirms.
- **Commit:** `docs(0.9-8.4): final checks` (tasks.md log only, plus any fixes as their own commits).

## 8.5 Release notes
- `docs/v0.9.0/release-notes.md` from TRD §12 (six upgrade steps), plus: what's new (accounts, vaults, modules, Admin, usage), removed/added variables, the set-aside of the old database and where the copy goes, what has to be redone (feeds, Gmail, prompt edits, Melete root and enrolment), known limits (global Obsidian vault name if still true, shared test vault flake is dev-only and not listed). Same shape as `docs/v0.8.0/release-notes.md`. Link it from `docs/README.md` (v0.9.0 entry → "done" once 8.4 is confirmed) and cite ADR 0066.
- **Commit:** `docs(0.9-8.5): release notes`.

## Order and the end-of-checkpoint report
Strict order 8.1 → 8.5. After the commits for 8.1–8.3 and the automated half of 8.4 I stop and report (what was built with hashes, test/lint/typecheck per folder, `pnpm e2e`, ADRs: none expected, nothing changes the TRD; deferred: manual 8.4 items, the two follow-ups in decision 8). 8.5 is written after Naresh confirms the manual checks, since the release notes should match what actually worked.

## Verification
- `pnpm e2e` green with all specs signed in and the new `multi-user.spec.ts`.
- Server absence test proves the route does not exist without the flag; startup guard test proves the flag is refused outside `NODE_ENV=test`.
- `grep` shows no stale `0.8.0` or removed variable names in docs and manifests.
- Manual checklist ticked by Naresh.

## Files
- Server: `apps/server/src/config.ts`, `server.ts`, `app.ts`, new `routes/testSession.routes.ts` (+ controller, tests), `apps/server/CLAUDE.md`.
- e2e: `e2e/docker-compose.e2e.yml`, `e2e/run.sh`, `e2e/tests/*.spec.ts`, new `e2e/tests/signedIn.ts`, `e2e/tests/multi-user.spec.ts`.
- Docs: `docs/google-cloud-setup.md` (new), `docs/phone-access.md`, `README.md`, `CLAUDE.md`, `docs/README.md`, `docs/v0.9.0/release-notes.md` (new), `docs/v0.9.0/tasks.md`, `docs/v0.9.0/plans/checkpoint-g.md` (saved from this plan on approval; Plan cell ticked).
- Versions: all `package.json`, `apps/agent/pyproject.toml`, `apps/agent/uv.lock`.
