# Mnemosyne v0.9.0 — Technical Requirements

Companion to `docs/v0.9.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.8.0 code at commit `46d223b`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet. A person who can sign in is a **user**; the one who manages users is the **admin**; everyone else is a **member**. A switchable part of the app is a **module** (`transcriber`, `melete`). A user's own vault folder under the vaults root is their **vault**.

## 1. Changes at a glance
- **Sign-in and sessions** (ADR 0061): Google OpenID Connect (code flow with PKCE and `state`, scopes `openid email profile`), allow-listed by `users.email`; opaque session tokens hashed in a `sessions` table, sent in an `HttpOnly` cookie, 30-day sliding expiry. `requireUser` in front of every `/api` router except auth and health.
- **Ownership and isolation** (ADR 0062): `user_id NOT NULL REFERENCES users ( id ) ON DELETE CASCADE` on every data table; uniqueness and list indexes per user; every repository function takes `userId` first; another user's ID is a 404; foreign keys are enforced (`PRAGMA foreign_keys = ON`). The only cross-user reads live in `repositories/system.repository.ts`.
- **Vaults** (ADR 0063): one mount `/vaults`, one folder per user named by `users.vault_dir`, chosen by the user on first sign-in (claim an unclaimed folder or create one). The agent gets `vault_dir` in each request.
- **Background loops** (ADR 0064): one loop of each kind across all users, gated by an `eligible_users` view; the worker and Melete generator pick round-robin by user.
- **Settings** (ADR 0065): per-user `settings ( user_id, key )` and a new `app_settings`; typed key enums; per-user seeding in `seedUser`; `health_*` split into app and user kinds.
- **Fresh start** (ADR 0066): migrations 1–9 collapse into one baseline at schema 10; a pre-0.9 database is copied to the backups folder and set aside; a backup is taken before any later migration.
- **Admin and usage** (ADR 0067): `/api/admin/*` for users, modules, vault reset and delete; a `usage_events` view over the four run tables.
- **Web** (ADR 0068): `GET /api/me` drives a root gate (sign in → choose vault → no modules → app), `RequireModule` route guards, filtered drawer and Settings tabs, a new **Admin** tab; JSON-only state-changing requests.
- **Shared:** `auth.ts` (new), `admin.ts` (new), `summarizer.ts` setting keys split, `agent.ts` gains `vault_dir`, `status.ts` (or wherever `HealthKind` lives) split into app and user kinds.
- **Server:** baseline schema, `users` / `sessions` / `userModules` / `appSettings` / `system` repositories (new), `clients/googleSignIn.client.ts` (new), `services/auth.service.ts`, `services/users.service.ts`, `services/admin.service.ts`, `services/vaultOnboarding.service.ts` (new), `middleware/auth.ts` (new), `routes/auth.routes.ts`, `routes/me.routes.ts`, `routes/admin.routes.ts` (new); `userId` threaded through every repository, service and controller; the loops rewritten to the shared-loop shape.
- **Agent:** `VAULT_PATH` becomes `VAULTS_ROOT`; `LinkRequest.vault_dir`; per-request vault resolution.
- **Web:** `api/me.api.ts`, `api/auth.api.ts`, `api/admin.api.ts` (new), `components/AuthGate`, `SignIn`, `ChooseVault`, `NoModules`, `RequireModule`, `AdminTab` (new), drawer and Settings filtering.
- **New dependencies** (and only these):
  - server: `google-auth-library` as a direct dependency, at the version already resolved in `pnpm-lock.yaml` under `@googleapis/gmail` (so no new package enters the tree). Check its `OAuth2Client` API (`generateAuthUrl`, `getToken`, `verifyIdToken`, `generateCodeVerifierAsync`) against §4 before using it; if it differs in a way that changes the design, stop and ask.
  - web, shared, agent, e2e: none.
- **Environment (server):** `ADMIN_EMAIL` (required), `APP_ORIGINS` (required, comma-separated origins the app is served at, e.g. `http://localhost:3100,https://<machine>.<tailnet>.ts.net`), `VAULTS_PATH` (default `/vaults`, replaces `VAULT_PATH`), `SESSION_DAYS` (default 30). `GOOGLE_REDIRECT_URI` is removed (redirects are derived per origin, §4.4). Existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` are now required.
- **Environment (agent):** `VAULTS_ROOT` (replaces `VAULT_PATH`).
- **Docker:** `VAULTS_HOST_PATH` (replaces `VAULT_HOST_PATH`) mounted at `/vaults` in `mnemosyne` (read-write) and `agent` (read-only).

## 2. Shared contracts (`packages/shared`)

### 2.1 Auth and users (`auth.ts`, new)
```ts
ModuleId      = 'transcriber' | 'melete'
Role          = 'admin' | 'member'
UserStatus    = 'active' | 'removed'
VaultDir      = z.string().regex( /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/ )   // 1–40 chars, no leading/trailing hyphen
Me            = { id: uuid, email, name, role: Role, modules: ModuleId[], vault_dir: VaultDir | null }
VaultChoice   = { folders: VaultDir[] }                       // unclaimed folders under /vaults, sorted
ClaimVaultBody  = { vault_dir: VaultDir }
CreateVaultBody = { vault_dir: VaultDir }
```
`modules` for the admin is always every `ModuleId`. Folder names under `/vaults` that don't match `VaultDir` are never listed.

### 2.2 Admin (`admin.ts`, new)
```ts
AdminUser       = { id, email, name, role, status: UserStatus, modules: ModuleId[], vault_dir: VaultDir | null,
                    last_signin_at: iso | null, created_at: iso }
CreateUserBody  = { email: z.email().toLowerCase(), name: 1–80 chars, modules: ModuleId[] }
UpdateUserBody  = partial of { name, modules, status }        // at least one field
DeleteUserBody  = { confirm: string }                         // must equal the user's email
UsageCategory   = 'summary' | 'linking' | 'melete' | 'extraction'
UsageTotals     = { input_tokens, output_tokens, cost_usd: number | null, runs: number }
UserUsage       = { user_id, month: Record< UsageCategory, UsageTotals >, all_time: Record< UsageCategory, UsageTotals >,
                    transcription: { month_seconds, all_time_seconds } }
UsageResponse   = { month: 'YYYY-MM', time_zone: string, users: UserUsage[] }
```

### 2.3 Settings (`summarizer.ts`)
- `UserSettingKey` (z.enum): `default_model`, `default_profile_id`, `linking_enabled`, `linking_model`, `extraction_model`, `melete_learning_root`, `melete_question_model`, `melete_grading_model`, `melete_review_mode`, plus the seed-marker keys used today.
- `AppSettingKey` (z.enum): `feed_check_interval_minutes`.
- The `Settings` response shape is unchanged for users; `feed_check_interval_minutes` stays in it, read from `app_settings`, and is writable only by the admin (a member's `PUT` with it is a 403-as-404, §5.4).

### 2.4 Health (`HealthKind`)
Split into `AppHealthKind` (`agent`, `whisper`, `backup`) and `UserHealthKind` (`feed`, `gmail_source`, `gmail_connection`), the kind names already in `status.ts`. `HealthKind` stays as their union.

### 2.5 Agent (`agent.ts`)
`LinkRequest` gains `vault_dir: VaultDir`. Per ADR 0043 the Pydantic model, the committed JSON Schema export, the golden examples and this Zod mirror change in one commit.

## 3. Data (SQLite)

### 3.1 Baseline schema (ADR 0066)
- `migrations` in `repositories/database.ts` becomes `[ baseline ]`, with `SCHEMA_BASE = 9`: the stored `user_version` after the baseline is 10, and every later migration is `SCHEMA_BASE + index + 1`. The "database from a newer version" check compares against `SCHEMA_BASE + migrations.length`.
- `baseline` creates the whole 0.9 schema directly: every 0.8 table with the changes in §3.2, plus `users`, `user_modules`, `sessions`, `app_settings` and the `eligible_users` and `usage_events` views. It seeds nothing; seeding is `seedUser` (§3.5).
- The migration functions `addNoteColumns` … `addMelete` and their seed code are deleted. Default prompt texts stay where they are (`summarizer/prompts.ts`, `melete/prompts.ts`).
- **During 0.9 development the baseline is edited by each Phase 4 task** as tables gain `user_id`. It isn't released until 0.9.0, so no migration is written for these intermediate changes. Tests always start from an empty database; a developer's local database is set aside by §3.6 or deleted by hand.

### 3.2 Table changes
Every table below gets `user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE` as its second column, except where noted.

| Table | Other changes |
| --- | --- |
| `jobs`, `summary_runs`, `link_runs`, `link_suggestions`, `extraction_runs` | Indexes `summary_runs_job`, `link_runs_job`, `link_suggestions_job` unchanged (keyed by job, which is owned). New `jobs_user_status ( user_id, status, created_at )`, `jobs_user_queue ( user_id, status, rowid )` |
| `prompt_profiles`, `prompt_versions` | `prompt_profiles_active_name` becomes unique on `( user_id, purpose, lower( name ) ) WHERE deleted_at IS NULL` (keep the existing expression, add `user_id` first) |
| `settings` | Primary key `( user_id, key )` |
| `feeds`, `feed_items` | `feeds_active_url` unique on `( user_id, feed_url ) WHERE deleted_at IS NULL`; `feed_items_inbox ( user_id, status, added_at )` |
| `gmail_account` | Primary key `user_id` (the `id = 1` check goes) |
| `gmail_sources`, `gmail_messages` | `gmail_messages_status ( user_id, status, added_at )` |
| `job_postings`, `posting_sightings` | `dedupe_key` unique per `( user_id, dedupe_key )`; `job_postings_seen ( user_id, first_seen_at )` |
| `health_status`, `health_errors` | `user_id` **nullable**, with `CHECK ( ( kind IN ( 'agent', 'whisper', 'backup' ) ) = ( user_id IS NULL ) )`; key stays `( kind, subject_id )` (subject IDs are UUIDs or, for `gmail_connection`, the user's ID) |
| `melete_subjects` | `folder` unique per `( user_id, folder )` |
| `melete_notes` | `melete_notes_path` unique on `( user_id, path ) WHERE missing_at IS NULL`; `melete_notes_hash ( user_id, body_hash )`; `melete_notes_queue ( user_id, generation, enrolled_at )` |
| `melete_questions`, `melete_reviews`, `melete_runs` | `melete_questions_due ( user_id, state, due )`; `melete_reviews_day ( user_id, reviewed_at )` |

Existing foreign keys between data tables stay; with enforcement on, the delete order in existing code is checked by the test suite (§11.1).

New tables:
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,                 -- lower-cased
  google_sub TEXT UNIQUE,                     -- set on first sign-in
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK ( role IN ( 'admin', 'member' ) ),
  status TEXT NOT NULL CHECK ( status IN ( 'active', 'removed' ) ),
  vault_dir TEXT UNIQUE,
  last_job_started_at TEXT,
  last_generation_started_at TEXT,
  last_signin_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX users_one_admin ON users ( role ) WHERE role = 'admin';
CREATE TABLE user_modules (
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK ( module IN ( 'transcriber', 'melete' ) ),
  PRIMARY KEY ( user_id, module )            -- a row means "on"
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,               -- hex SHA-256 of the token
  user_id TEXT NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions ( user_id );
CREATE TABLE app_settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
```

Views:
```sql
CREATE VIEW eligible_users AS                -- one row per (user, module) the loops may work for
  SELECT u.id AS user_id, m.module, u.vault_dir
  FROM users u JOIN ( SELECT 'transcriber' AS module UNION ALL SELECT 'melete' ) m
  WHERE u.status = 'active'
    AND ( u.role = 'admin' OR EXISTS ( SELECT 1 FROM user_modules um WHERE um.user_id = u.id AND um.module = m.module ) );

CREATE VIEW usage_events AS
  SELECT user_id, 'summary'    AS category, created_at, input_tokens, output_tokens, cost_usd FROM summary_runs
  UNION ALL SELECT user_id, 'linking',    created_at, input_tokens, output_tokens, cost_usd FROM link_runs
  UNION ALL SELECT user_id, 'melete',     created_at, input_tokens, output_tokens, cost_usd FROM melete_runs
  UNION ALL SELECT user_id, 'extraction', created_at, input_tokens, output_tokens, cost_usd FROM extraction_runs;
```
Use each run table's real timestamp column name; if one differs from `created_at`, alias it.

### 3.3 Opening the database
`openDatabase( path )`, in order:
1. Read `user_version`. If it is 1–9: set the file aside (§3.6) and continue with a new empty file.
2. If it is above `SCHEMA_BASE + migrations.length`: refuse, as today.
3. If it is ≥ 10 and below the target: write the pre-migration backup (§3.6); on failure refuse to start.
4. `journal_mode = WAL`, `foreign_keys = ON`, then `runMigrations`. `PRAGMA foreign_keys` is set outside the migration transaction (it has no effect inside one).
5. After migrating, `PRAGMA foreign_key_check`; any row reported is a startup error.

### 3.4 Repositories
- Every function in every data repository takes `userId: string` as its first parameter, with no default and no overload, and adds `user_id = ?` to every `WHERE`, and `user_id` to every `INSERT`. Updates and deletes by ID are `WHERE id = ? AND user_id = ?` and return whether a row changed; services turn "no row" into `NotFoundError` (404).
- New: `users.repository.ts` (`findUserByEmail`, `findUserById`, `insertUser`, `updateUser`, `bindGoogleSub`, `setVaultDir`, `clearVaultDir`, `listUsers`, `deleteUser`, `touchSignIn`), `userModules.repository.ts` (`listModules`, `setModules` replacing the set in one statement batch), `sessions.repository.ts` (`insertSession`, `findSession`, `touchSession`, `deleteSession`, `deleteSessionsForUser`, `deleteExpiredSessions`), `appSettings.repository.ts` (`getAppSetting`, `setAppSetting` typed on `AppSettingKey`).
- `settings.repository.ts`: `getSetting( userId, key: UserSettingKey )`, `setSetting( userId, key, value )`.
- `health.repository.ts`: `recordCheck` takes `userId: string | null`; reads take `{ userId, includeApp }`.
- `system.repository.ts` (new) holds the only queries without a `userId` argument (§6). Each returns rows with `user_id`.

### 3.5 Seeding (`services/seedUser.service.ts`, new)
`seedUser( userId, now )` runs in one transaction when a user row is inserted (admin on first sign-in, member on **Add user**): inserts the seeded prompt profiles (the existing `SEEDED_PROFILES` summary profiles including Study, the linker, Melete questions and grading) each with version 1 from the existing default texts, writes the seed markers, and writes `default_profile_id`. Other user settings are read with their existing defaults when unset, as today. Locked instructions are code and shared. Reset-to-default works per user exactly as today.

### 3.6 Set-aside and pre-migration backups
- **Set-aside (pre-0.9 database):** `VACUUM INTO '<backupDir>/pre-0.9-<timestamp>.db'`, close, delete the database file and its `-wal` and `-shm` files, open a new empty file. Logged at `warn` with the copy's path. If the copy fails, close and throw; nothing is deleted. The timestamp format is `backupName`'s.
- **Pre-migration backup (schema ≥ 10):** `VACUUM INTO '<backupDir>/pre-migration-v<from>-to-v<to>-<timestamp>.db'` before `runMigrations`.
- Both record a check on the `backup` health subject after the database is open (`recordCheck` needs the database). Both run synchronously in `openDatabase`, before the server listens.

## 4. Sign-in and sessions (ADR 0061)

### 4.1 Config (`config.ts`)
`ADMIN_EMAIL` (required, `z.email()`, lower-cased), `APP_ORIGINS` (required, comma-separated, each `z.url()` with no path, normalised to `scheme://host[:port]`), `SESSION_DAYS` (default 30, 1–365), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` (now required, as sign-in needs all three), `VAULTS_PATH` (default `/vaults`). `GOOGLE_REDIRECT_URI` and `VAULT_PATH` are removed; a leftover value is ignored with a startup `warn`.

### 4.2 Origins
- `requestOrigin( req )`: `X-Forwarded-Proto` and `X-Forwarded-Host` when the socket peer is loopback (Tailscale Serve and the browser on the Mac both connect from loopback), else the socket's own scheme and the `Host` header. The result must be in `APP_ORIGINS`; otherwise the auth routes answer 400 "This address isn't configured in APP_ORIGINS".
- Before writing §4.2, check what headers `tailscale serve` actually forwards (Tailscale's current docs and a manual request); record it in the task log. If it forwards `Host` unchanged and no `X-Forwarded-*`, use `Host` and treat the `https` origin with that host as the match.
- The redirect URI for sign-in is `<origin>/api/auth/callback`, for Gmail `<origin>/api/gmail/oauth/callback`. Both are registered in the Google Cloud OAuth client for every origin (documented, §10).

### 4.3 Client (`clients/googleSignIn.client.ts`, new)
- `buildSignInUrl( { origin, state, codeChallenge } )`: `OAuth2Client.generateAuthUrl` with `scope: [ 'openid', 'email', 'profile' ]`, `prompt: 'select_account'`, `code_challenge_method: S256`.
- `exchangeSignInCode( { origin, code, codeVerifier } )` → `{ sub, email, email_verified, name }`: `getToken` then `verifyIdToken( { idToken, audience: GOOGLE_CLIENT_ID } )`. Anything else throws `SignInError`.
- Behind an interface so tests inject a fake; no test calls Google.

### 4.4 Flow (`routes/auth.routes.ts`, `services/auth.service.ts`)
| Route | Behaviour |
| --- | --- |
| `GET /api/auth/google?returnTo=` | Make `state` and a PKCE verifier (32 random bytes each, base64url). Store `{ state, verifier, returnTo, origin }` in a short-lived signed cookie `mnemosyne_oauth` (`HttpOnly`, `SameSite=Lax`, 10 minutes, HMAC-SHA256 with a key derived by HKDF from `TOKEN_ENCRYPTION_KEY` (info `mnemosyne-oauth-cookie`)). `returnTo` must start with `/` and not `//`; otherwise `/`. Redirect to Google. |
| `GET /api/auth/callback?code&state` | Check `state` against the cookie and clear it. Exchange the code. Refuse unless `email_verified`. Look up `users` by lower-cased email: if found and `active`, bind `google_sub` (first time) or check it matches (a different `sub` for the same email is refused); if not found and the `users` table is empty and the email equals `ADMIN_EMAIL`, insert the admin and run `seedUser` in one transaction; otherwise redirect to `/signin?error=not_allowed`. Create the session (§4.5), `touchSignIn`, redirect to `returnTo`. |
| `POST /api/auth/signout` | Delete the session row, clear the cookie, 204. |
| `GET /api/me` | `Me` for the signed-in user (behind `requireUser`). |

A `removed` user is treated as unknown at sign-in. Failures redirect to `/signin?error=<code>` (`not_allowed`, `expired`, `failed`) and log the reason at `warn` without tokens or the email.

### 4.5 Sessions (`services/session.service.ts`, new)
- Token: 32 random bytes, base64url. Stored: hex SHA-256 only.
- Cookie `mnemosyne_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when the request origin is `https`, `Max-Age` = `SESSION_DAYS`.
- `requireUser`: read the cookie (a small parser in `middleware/auth.ts`, no `cookie-parser`), look up the hash; missing, expired, or a user that isn't `active` → 401 `{ error: 'unauthenticated' }` and clear the cookie. Otherwise set `req.user = { id, role, modules, vault_dir }` and, at most once an hour per session, extend `expires_at` and `last_seen_at` and re-send the cookie.
- `deleteExpiredSessions` runs from the sweeper.
- `req.user` is typed by module augmentation of Express's `Request`; controllers read it through one `currentUser( req )` helper that throws if absent.

### 4.6 Middleware order (`app.ts`)
`requestLog` → `express.json` → `jsonOnly` → `healthRoutes` → `authRoutes` → `requireUser` → `meRoutes` → the existing routers → `requireAdmin` + `adminRoutes` → `notFoundHandler`. The web routes (static files) are not behind `requireUser`; the SPA handles sign-in.
- `jsonOnly` (new): `POST`, `PUT`, `PATCH` and `DELETE` under `/api` must have `Content-Type: application/json` (bodyless requests send `{}`), else 415. Exempt: none.
- The request logger adds `user_id` to each request's log context once `requireUser` has run. Emails are never logged.

## 5. Ownership in services and routes (ADR 0062)

### 5.1 Threading
- Controllers pass `currentUser( req ).id` to services; services pass it to repositories. Background code passes the row's `user_id` (§6).
- Per-user state that was module-level becomes keyed by user: `melete/scanClock.ts` (`markScanned( userId )`, `isScanFresh( userId )`, `resetScanClock( userId? )`), the scan service's single-flight promise (a `Map< userId, Promise >`), and any other cache found while threading (record each one in the task log).
- `vault.service.ts`, `jobs.service.ts` (save), the folder picker, `meleteScan.service.ts` and `meleteGeneration.service.ts` take the vault root from `vaultRootFor( user )` (§7.1) instead of `config.vaultPath`.
- Gmail: `gmail_account` per user; the OAuth `state` for Gmail carries the user's ID and is checked against the session on callback; the token is encrypted with the same key as today.

### 5.2 Not found, not forbidden
A request for another user's resource, or for a route of a module the user doesn't have, returns 404 with the same body as an unknown ID. `requireAdmin` also answers 404.

### 5.3 Module gating (`middleware/requireModule.ts`, new)
`requireModule( 'transcriber' )` on the jobs, feeds, inbox, Gmail, Gmail sources, link-suggestion, vault-folders and summary-prompt routes; `requireModule( 'melete' )` on `/api/melete/*`. Settings, models, prompt profiles and status are shared: they filter by the user's modules (prompt profiles by `purpose`: summary and linker need Transcriber; the two Melete purposes need Melete).

### 5.4 Admin-only settings
`PUT /api/settings` with `feed_check_interval_minutes` from a member is a 404 for the whole request (nothing saved). `POST /api/backups` and `POST /api/status/refresh` for app kinds are admin-only.

## 6. Background loops (ADR 0064)

### 6.1 `system.repository.ts`
- `claimNextJob( now )`: in one transaction, pick the oldest queued job of the eligible Transcriber user with the oldest `last_job_started_at` (nulls first, then `users.created_at`) that has a queued job, move it to its first running status through the lifecycle module (`moveTo`), and set that user's `last_job_started_at`. Returns the job with `user_id`. This replaces the worker's current next-job query (`jobStore.repository.ts:140`).
- `claimNextGeneration( now )`: same shape over `melete_notes` queued for generation, for eligible Melete users with a `vault_dir`, using `last_generation_started_at`.
- `listDueFeeds( now )`, `listDueGmailSources( now )`: today's least-recently-checked queries joined to `eligible_users` (Transcriber); Gmail sources only where the owner's `gmail_account.status` is connected.
- `listExpiredJobs( now )` for the sweeper: all users, no eligibility filter.
- `listRestartRequeue()`: jobs and notes stuck in running states at startup, all users.

### 6.2 Loops
- `worker.ts`: calls `claimNextJob`; loads the owner's settings, prompts and vault for the run. One job at a time, as today.
- Linking step (`linkJob.ts`): if the owner has no `vault_dir`, record a link error "Choose a vault first" and move the job to review, as for any linking failure. The agent call sends `vault_dir`.
- `intakePoller.ts`: iterates `listDueFeeds` and `listDueGmailSources`; each check records health with the source owner's `user_id`.
- `meleteGenerator.ts`: calls `claimNextGeneration`.
- `sweeper.ts`: expiry for all users plus `deleteExpiredSessions`.
- `serviceMonitor.ts`: app kinds only, `user_id NULL`.
- A disabled module or removed user: their queued work stays queued and is never claimed. Turning the module back on or restoring the user resumes it.

## 7. Vaults (ADR 0063)

### 7.1 Server
- `config.vaultsPath` (`/vaults`). `vaultRootFor( user )` returns `path.join( config.vaultsPath, user.vault_dir )` and throws `VaultNotChosenError` (409 "Choose your vault first") when `vault_dir` is null. The existing `realpath` / `isInside` confinement then applies within that root, unchanged.
- Routes that need a vault (save, folder tree, folder create, Melete scans) return that 409 when no vault is chosen; the web gate (§9) prevents it in practice.

### 7.2 Onboarding (`services/vaultOnboarding.service.ts`, `routes/me.routes.ts`)
| Route | Behaviour |
| --- | --- |
| `GET /api/me/vaults` | Directories directly under `/vaults` whose names match `VaultDir`, not symlinks, and not any user's `vault_dir`. Only when the caller has no vault; otherwise 409. |
| `POST /api/me/vault` `{ vault_dir }` | Claim: folder must exist, match `VaultDir`, `realpath` inside `/vaults`, and be unclaimed. Set in one statement relying on `users.vault_dir UNIQUE`; a constraint error is 409 "That vault is already taken". Only when the caller has no vault. |
| `POST /api/me/vault/new` `{ vault_dir }` | Create the folder (`mkdir`, not recursive; existing → 409) then claim it as above; if the claim fails, remove the empty folder. |

### 7.3 Agent (`apps/agent`)
- `config.py`: `VAULTS_ROOT` replaces `VAULT_PATH` (must be an existing directory).
- Contract: `LinkRequest.vault_dir: str` with the `VaultDir` pattern (Pydantic `constr` / `Field( pattern = … )`).
- `vault_for( settings, vault_dir )`: `( root / vault_dir ).resolve( strict = True )` must be a directory and `is_relative_to( root.resolve() )`; otherwise 422 with `{ "error": "unknown_vault" }`. The loop and tools take that path where they take `settings.vault_path` today.
- `/health` checks `VAULTS_ROOT` exists and is readable (no longer that the vault is non-empty).
- The server logs a 422 as a link error, not a crash.

### 7.4 Docker
```yaml
mnemosyne:
  volumes:
    - ${VAULTS_HOST_PATH:?Set VAULTS_HOST_PATH in .env to the folder that holds the vaults}:/vaults
agent:
  environment:
    VAULTS_ROOT: /vaults
  volumes:
    - ${VAULTS_HOST_PATH:?…}:/vaults:ro
```
The e2e override mounts a temp folder with one fixture vault per e2e user.

## 8. Admin and usage (ADR 0067)

### 8.1 Routes (`routes/admin.routes.ts`, behind `requireAdmin`)
| Route | Behaviour |
| --- | --- |
| `GET /api/admin/users` | `AdminUser[]`, admin first, then by name. |
| `POST /api/admin/users` | `CreateUserBody`. Email unique (409 otherwise). Inserts user (`member`, `active`), modules and `seedUser` in one transaction. 201 `AdminUser`. |
| `PATCH /api/admin/users/:id` | `UpdateUserBody`. `status: 'removed'` deletes the user's sessions in the same transaction. The admin can't be targeted (409 "You can't change your own account here"). |
| `POST /api/admin/users/:id/reset-vault` | Clears `vault_dir`. Nothing in the vault or database is deleted; the user's Melete subjects point at folders that are absent until the same folder is claimed again. |
| `DELETE /api/admin/users/:id` | `DeleteUserBody`. Only for `removed` users (409 otherwise); `confirm` must equal the email (400 otherwise). `DELETE FROM users WHERE id = ?`; everything cascades. The vault folder is never touched. 204. |

### 8.2 Usage (`services/admin.service.ts`)
- `GET /api/admin/usage?month=YYYY-MM` (default: the current month in `APP_TIME_ZONE`).
- Month bounds are computed in `APP_TIME_ZONE` and converted to UTC ISO strings, then `SUM` / `COUNT` over `usage_events` grouped by `user_id, category` for the month and for all time. `cost_usd` is `null` when every run in the bucket has a null cost.
- Transcription seconds: sum of each video job's stored duration (the same field the formatters read), month bucket by `created_at`. No cost in 0.9.

## 9. Web (ADR 0068)

### 9.1 Data
- `api/me.api.ts` (`getMe`, `listVaults`, `claimVault`, `createVault`), `api/auth.api.ts` (`signOut`), `api/admin.api.ts` (users CRUD, usage); `meKeys`, `adminKeys`.
- `api/request.ts`: every mutating request sends `Content-Type: application/json` and a body (`{}` when none). A 401 from any request calls `queryClient.invalidateQueries( { queryKey: meKeys.all } )`; `useMe` treats 401 as "signed out" (not an error) and doesn't retry it.

### 9.2 Gate (`components/AuthGate.tsx`, root route element)
Renders exactly one of: a loading state; `SignIn` (on 401: a **Sign in with Google** button that sets `window.location` to `/api/auth/google?returnTo=<current path + search>`, and the error from `?error=`); `ChooseVault` (no `vault_dir`); `NoModules`; otherwise `<Outlet />` inside the existing app shell. `/signin` is a route that renders `SignIn` and, if already signed in, redirects to `/`.

### 9.3 Choose your vault (`components/ChooseVault.tsx`)
A list of unclaimed folders (radio list) with **Use this vault**, and a **Create new vault** text field with the `VaultDir` rule shown as helper text. On success, invalidate `me`. A 409 shows the server's message and refreshes the list.

### 9.4 Module guards and drawer
- `RequireModule` wraps the Transcriber routes (`/`, `jobs/:id`) and the Melete routes. Without the module it navigates to the home of the first module the user has (`transcriber` → `/`, `melete` → `/melete`).
- The drawer lists only the user's modules; **Sign out** sits at the bottom with the theme toggle and Settings and calls `signOut` then invalidates `me`.

### 9.5 Settings
- Prompts tab: the `purpose` groups the user's modules allow (§5.3).
- Models tab: the Transcriber and Melete sections the user's modules allow.
- Sources tab: Transcriber only. The Status panel shows the user's own sources and, for the admin, the app services; the feed interval and **Back up now** are admin-only. The tab is hidden for a member without Transcriber.
- **Admin** tab (`/settings/admin`, admin only, new): users table; **Add user** dialog (email, name, module checkboxes); per-user module switches; **Remove** / **Restore**; **Reset vault** (confirm dialog); **Delete user** (only when removed; type the email to confirm); a usage section with a month picker showing per-user cost by category and transcription minutes.
- The Settings index redirect goes to the first tab the user can see.

### 9.6 iOS home-screen app
Manual check in the final checkpoint: install Melete from the Tailscale address on the iPhone, sign in from the installed app, and confirm the session lands in the installed app (not only Safari). If it doesn't, stop and ask; the likely fallback is a device sign-in code flow, recorded as an ADR.

## 10. Docs
- `docs/google-cloud-setup.md` (new): the OAuth client's authorised redirect URIs for every origin (sign-in and Gmail), adding each user as a test user while the consent screen is in testing, the `openid email profile` scopes beside the Gmail scope.
- `docs/phone-access.md`: add `APP_ORIGINS` for the Tailscale address, sharing the app with another person on the tailnet (invite or share the node), and the sign-in step.
- `README.md` and every `CLAUDE.md` touched: users and roles, sign-in, vault onboarding, modules, Admin, new and removed variables, the vaults folder layout.
- `release-notes.md`: upgrade steps (§12).

## 11. Testing

### 11.1 Server
- **Schema guard** (`database.schema.test.ts`, new): every table except `users`, `user_modules`, `sessions`, `app_settings` has `user_id` `NOT NULL` with a cascading foreign key to `users`, except `health_status` and `health_errors` (nullable, with the check). During Phase 4 the test holds an explicit list of not-yet-converted tables that each task shrinks; it must be empty when Phase 4 ends.
- **Repository isolation:** for each repository, a two-user test: seed rows for A and B, then every read, list, update and delete called with B's ID never returns or changes A's rows.
- **Route isolation:** for each router, A's resource IDs requested as B return 404, and with the module off return 404.
- **Signature guard:** a test that imports every data repository module and checks each exported function's first parameter is named `userId` (via `Function.prototype.toString`), excluding `system.repository.ts`, `users.repository.ts`, `sessions.repository.ts`, `appSettings.repository.ts`.
- **Auth:** fake sign-in client; callback cases (verified email, unknown email, empty table with and without `ADMIN_EMAIL`, removed user, `sub` mismatch, bad `state`, `returnTo` checks); session expiry and sliding; sign-out; `jsonOnly`.
- **Opening:** v9 fixture file set aside and empty start; failed set-aside refuses; pre-migration backup for a fake migration 11 in a test; `foreign_key_check` failure refuses.
- **Loops:** round-robin across two users; module off and removed user never claimed; resume when restored; no vault → link error.
- **Admin:** each route as admin and as member; self-target refused; remove deletes sessions; delete cascades (every table empty for A and unchanged for B); usage either side of a Singapore month boundary.
- `test-support/auth.ts` (new): `createTestUser( { role, modules, vault_dir } )` and `signedIn( agent, user )` that inserts a session row and sets the cookie on a Supertest agent. Existing route tests switch to it; list each changed file in the task log.
- No test calls Google, Anthropic, Gmail or a real vault.

### 11.2 Agent
`vault_dir` validation (pattern, unknown folder, symlink out of the root, `..`), the 422, and the existing linker tests run against `VAULTS_ROOT/<fixture>`. Golden examples gain `vault_dir`.

### 11.3 Web
Gate states, `returnTo`, 401 invalidation, `ChooseVault` (claim, create, 409), `RequireModule` redirects, drawer and Settings tabs for an admin, a Transcriber-only member and a Melete-only member, the Admin tab (add, toggle, remove, reset vault, delete confirm, usage). Browser screenshots light and dark for the gate pages and the Admin tab; phone width for `SignIn` and `ChooseVault`.

### 11.4 e2e (ADR 0053)
- The e2e Compose override sets `E2E_TEST_SIGNIN=1`, which mounts `POST /api/test/session { email }` (creates the user if needed, with modules and a vault from the body, and sets the session cookie). The server refuses to start with `E2E_TEST_SIGNIN` set unless `NODE_ENV=test`; a unit test proves the route is absent otherwise.
- Specs: the existing article and feed paths and the Melete spec run signed in as the admin; a new `multi-user.spec.ts` signs in as a member with Melete only, checks the drawer, checks that the admin's job ID is a 404, and claims a vault on first sign-in.

## 12. Upgrade (release notes)
1. Save or discard any review drafts; copy the text of any edited prompt profiles.
2. Move the vault into a parent folder (e.g. `~/Vaults/naresh`) and reopen it in Obsidian.
3. `.env`: add `ADMIN_EMAIL`, `APP_ORIGINS`, `VAULTS_HOST_PATH`; remove `VAULT_HOST_PATH`, `GOOGLE_REDIRECT_URI`. Add the redirect URIs in Google Cloud (`docs/google-cloud-setup.md`).
4. `docker compose up -d --build`. The old database is copied to the backups folder as `pre-0.9-<timestamp>.db` and the app starts empty.
5. Sign in with Google as `ADMIN_EMAIL`, choose your vault, re-add feeds, reconnect Gmail, re-enter prompt edits, set the Melete learning root and re-enroll.
6. Add your brother in **Settings → Admin**, add him as a test user in Google Cloud, and share the app on your tailnet.
