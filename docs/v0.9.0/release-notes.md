# Mnemosyne v0.9.0 — Release notes
v0.9.0 makes Mnemosyne a small multi-user app. You (the admin) and the people you add each sign in with Google, have their own vault, and see only the modules you switch on for them. Everything a person does is their own: jobs, feeds, Gmail, prompts, settings, notes and Melete questions. Transcribing, summarizing, linking, reviewing, saving and quizzing behave as in 0.8.0 for each person.

**This is a breaking upgrade.** The database starts empty (the old one is kept as a copy), the vault moves into a parent folder, and `.env` changes. Read [Upgrading](#upgrading) before you rebuild.

## New

### Accounts and sign-in
- **Sign in with Google** (ADR 0061). The first account to sign in must be `ADMIN_EMAIL` and becomes the admin; after that only people the admin has added get in, and anyone else sees a plain "not allowed" page. A sign-in lasts `SESSION_DAYS` (30) from last use; **Sign out** is in the drawer. Only a hash of the session token is stored.
- **One Google client for sign-in and Gmail**, with redirect URIs for every address in `APP_ORIGINS`: [`docs/google-cloud-setup.md`](../google-cloud-setup.md). Gmail now works from any listed address, including the Tailscale one.
- Every state-changing request must be JSON (a form post from another site is refused with a 415).

### Ownership and isolation
- Every table has an owner (ADR 0062). A person never sees, changes or guesses another person's item: it is a 404, not a 403. A guard test enforces that repositories take the user first.
- The background loops (the job worker, the feed and Gmail poller, the Melete generator) serve everyone and take turns between people who have work waiting (ADR 0064). Work for a person who is removed or has a module off waits untouched until access returns.

### Vaults
- One vaults folder holds one folder per person, mounted at `/vaults` (ADR 0063). On the first sign-in you claim an unclaimed folder (the way to bring an existing Obsidian vault) or create a new one. Nobody can claim a folder someone else has, and the app and the agent refuse a path outside the vaults folder, symlinks included. The agent now receives the person's `vault_dir` with each request.
- **A missing vault is recoverable** (ADR 0070). If your folder is deleted, renamed or unmounted, the app answers "Your vault folder is missing" (a 409, not an error page), shows the vault page with a note naming the folder, and lets you, the admin included, claim another folder or create a new one. Nothing is deleted. Melete marks the missing notes and restores them if they return.

### Modules and the Admin tab
- The admin switches **Transcriber** and **Melete** on or off per person (ADR 0068). A person sees only their modules in the drawer and Settings; a route of a module they lack is a 404; someone with no module sees a page saying the admin hasn't switched anything on.
- **Settings → Admin** (ADR 0067): add a person (email, name, modules), module switches, **Remove** and **Restore** (a removed person is signed out at once and their work waits), **Reset vault**, **Delete user** (removed people only, with their email typed; deletes their data from the database, never files in a vault), and a **usage** report for a month you pick: each person's estimated cost by category and transcription minutes. You can't remove, reset or delete yourself.
- Prompt profiles, models and settings are per person. The feed check interval, **Back up now** and the agent, whisper-server and backup status rows are the admin's.

## Changes
- **Fresh baseline database** (ADR 0066). Migrations 1–9 are collapsed into one schema. A database from 0.8.0 or earlier is copied to your backups folder as `pre-0.9-<timestamp>.db`, set aside, and the app starts empty. Later migrations take a copy first (`pre-migration-v<from>-to-v<to>-<timestamp>.db`). Both copies show as the latest backup in the Status panel.
- **Variables.** Required and new: `ADMIN_EMAIL`, `APP_ORIGINS`, `VAULTS_HOST_PATH` (Compose) and `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (all three were optional before). New and optional: `SESSION_DAYS`, `VAULTS_PATH` (`/vaults` in Docker). Removed: `VAULT_PATH`, `VAULT_HOST_PATH` and `GOOGLE_REDIRECT_URI` (a leftover `VAULT_PATH` or `GOOGLE_REDIRECT_URI` is ignored and logged as a warning). The agent reads `VAULTS_ROOT` instead of `VAULT_PATH`.
- **API.** New `/api/auth/*`, `/api/me*` and `/api/admin/*` routes (see the README); every other route needs a session. `Me` carries `vault_dir` and `vault_missing`. The agent's contract gains `vault_dir` and its `422 unknown_vault`.
- **`jobs.duration_seconds`** keeps a video's length after the transcript is deleted, so usage can count transcription minutes (ADR 0069).
- **Sign-in over Tailscale works under Docker Desktop.** The app trusts `X-Forwarded-*` headers from loopback and private-network peers, because Docker Desktop shows requests through the published port as coming from its gateway (ADR 0071).
- **`DEFAULT_NOTE_FOLDER`** is created in a person's vault the first time a note is saved there, not at startup.
- **e2e.** `pnpm e2e` signs in through a test-only session route that exists only in that stack (`E2E_TEST_SIGNIN`, refused outside `NODE_ENV=test`).
- New dependency: `google-auth-library` (server), at the version already in the lockfile.

## Upgrading
1. **Save or discard any review drafts**, and copy the text of any prompt profile you edited: the new database starts empty, so they would otherwise be left in the set-aside copy only.
2. **Move your vault into a parent folder**, for example `~/Vaults/naresh`, and reopen it in Obsidian from there.
3. **Update `.env`** at the repo root: add `ADMIN_EMAIL`, `APP_ORIGINS` (`http://localhost:3100`, plus your Tailscale address if you use one) and `VAULTS_HOST_PATH` (the parent folder, for example `~/Vaults`); make sure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` are set (keep the same key if Gmail was connected, though you will reconnect anyway); remove `VAULT_HOST_PATH` and `GOOGLE_REDIRECT_URI`. Add the sign-in and Gmail redirect URIs for each address to the Google client ([`docs/google-cloud-setup.md`](../google-cloud-setup.md)).
4. **Rebuild:** `docker compose up -d --build`. The old database is copied to the backups folder as `pre-0.9-<timestamp>.db` and the app starts empty. Keep that file until you are sure you don't need anything from it.
5. **Sign in** at `http://localhost:3100` with the `ADMIN_EMAIL` account and **choose your vault** (claim the folder you moved). Then re-add your feeds, reconnect Gmail and its sources, re-enter prompt edits, set the Melete learning root and re-enroll your notes.
6. **Add other people** in Settings → Admin, add them as test users in Google Cloud if the app is in *Testing*, and share the app on your tailnet ([`docs/phone-access.md`](../phone-access.md)). They sign in and choose their own vault.
7. For development, `apps/server/.env` needs the same new variables, and `http://localhost:5173/api/auth/callback` in the Google client.

You can't go back to 0.8.0 by rebuilding: restore the set-aside copy ([`docs/backups.md`](../backups.md)) and use the 0.8.0 code.

## Deferred
- Per-user quotas or spend limits, and a per-model view of usage (the Admin tab shows month and category).
- Obsidian Sync or another way for other people to open their vault in their own Obsidian: in 0.9 every vault lives on your Mac (ADR 0063).
- A device sign-in code flow, if the iPhone home-screen app ever fails to keep its session (it kept it in the release check).
- Everything on the roadmap in the README.

## Known issues
- **"Open in Obsidian" uses one vault name for everyone.** `OBSIDIAN_VAULT_NAME` is app-wide, so the link matches only one person's vault.
- **The Tailscale sharing steps in `docs/phone-access.md`** were written from the app's side; check a menu name there against Tailscale's docs if it doesn't match.
- A vault folder that disappears fails queued work for that person at the point of use (a link error, a Melete scan 409, a failed note) until they choose again; it is retryable afterwards.
- Known from earlier versions: pages that need JavaScript or a login can't be read; the web bundle is large; costs are estimates from a price table.

## Under the hood
- Server: `users`, `userModules`, `sessions` and `appSettings` repositories, `system.repository.ts` (the only queries without a user), `session`, `auth`, `seedUser`, `vaultOnboarding`, `admin` and `modules` services, `googleSignIn.client.ts`, the `auth`, `requireModule`, `requestOrigin` and `jsonOnly` middleware, and `vaultRootFor` with `VaultNotChosenError` and `VaultMissingError`. Agent: `vault_for` and `VAULTS_ROOT`. Web: `AuthGate`, `SignIn`, `ChooseVault`, `NoModules`, `RequireModule`, the Admin tab and its parts, `useMe`.
- Tests at release: 693 shared, 3026 server and 1658 web unit tests, 62 browser tests (Chromium and WebKit), 280 agent tests and 4 container tests, and 7 e2e specs, with lint, typecheck and builds clean.
- Manual checks passed before release: the upgrade with the old database set aside, sign-in as admin, choosing the vault, adding a member and signing in over Tailscale from another device, isolation by hand, module switches, usage, the Tailscale origin, the iPhone home-screen app, and a missing vault folder.

## Decisions
New ADRs: [0061](../decisions/0061-google-sign-in-and-sessions.md) Google sign-in and sessions · [0062](../decisions/0062-per-user-ownership-and-isolation.md) per-user ownership and isolation · [0063](../decisions/0063-per-user-vaults-and-onboarding.md) per-user vaults and onboarding · [0064](../decisions/0064-shared-background-loops.md) shared background loops · [0065](../decisions/0065-user-and-app-settings.md) user and app settings · [0066](../decisions/0066-fresh-baseline-schema.md) fresh baseline schema · [0067](../decisions/0067-admin-and-usage.md) admin and usage · [0068](../decisions/0068-web-gate-and-module-guards.md) web gate and module guards · [0069](../decisions/0069-job-keeps-video-duration.md) a job keeps its video's duration · [0070](../decisions/0070-choose-a-new-vault-when-missing.md) choose a new vault when missing · [0071](../decisions/0071-trusted-proxy-peers.md) forwarded headers are trusted from loopback and private-network peers. ADRs 0012, 0035 and 0060 are amended (by 0066, 0061 and 0061), and 0061 by 0071.
