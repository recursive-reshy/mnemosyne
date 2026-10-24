# Tasks — Mnemosyne v0.9.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(0.9-<id>): …`, `refactor(0.9-<id>): …`, plans as `docs(0.9-plan): checkpoint <x>`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package (and `test:browser` for web, `uv run pytest` / Ruff / Pyright for the agent), browser screenshots (light and dark; phone width for the sign-in and vault pages) of any screens touched, `pnpm e2e`, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR (from 0069) and add its number to the task's ADR column.
- **Isolation is the point of this release** (ADR 0062). A query without `user_id`, outside `system.repository.ts` and the four exempt repositories, is a bug. Another user's resource is a 404, never a 403.
- **The baseline schema is edited in place during Phase 4** (TRD §3.1). No intermediate migrations. The schema guard's list of unconverted tables must be empty when Phase 4 ends.
- **Dependencies:** only `google-auth-library` in `apps/server`, as a direct dependency at the version already in `pnpm-lock.yaml` (TRD §1), added by the task that first uses it. Check its real API against TRD §4.3 first; if it differs in a way that changes the design, stop and ask.
- **No test touches the network, Google, the Claude API, Gmail or a real vault.** Sign-in uses the fake client and `test-support/auth.ts`; the e2e stack uses the test-only session route (TRD §11.4).
- Existing tests pass unchanged, except the changes TRD §11.1 allows (signing in, passing a user, per-user fixtures); list each changed file in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–2 (kick-off, contracts and baseline)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Set ADRs 0061–0068 to Accepted (Status lines and the `docs/README.md` index); mark 0035 and 0060 "amended by 0061" and 0012 "amended by 0066" in the index; `docs/README.md` current version 0.9.0 and the v0.9.0 entry "in progress" (v0.8.0 is already marked done); root `CLAUDE.md` first paragraph (multi-user, vaults root). The root `CLAUDE.md` already points at 0.9.0 (updated with these docs) | 0061–0068 | ✅ |
| **Phase 2** | **Contracts and baseline** | | |
| 2.1 | Shared `auth.ts` and `admin.ts` (TRD §2.1–2.2) with schema tests; exported from `index.ts` | 0061, 0063, 0067 | ⬜ |
| 2.2 | Shared `UserSettingKey` / `AppSettingKey` (TRD §2.3), `AppHealthKind` / `UserHealthKind` (§2.4); tests and fixtures that list every key updated | 0065 | ⬜ |
| 2.3 | Baseline schema: collapse migrations 1–9 into `baseline` at `SCHEMA_BASE = 9` with the 0.8 tables unchanged plus `users`, `user_modules`, `sessions`, `app_settings` (TRD §3.1–3.2); delete the old migration functions; their seeding moves to a temporary `seedDefaults()` run after migrations (so existing tests keep their seeded profiles), replaced by `seedUser` in 3.2; the newer-version check on `SCHEMA_BASE + migrations.length`; `foreign_keys = ON` and `foreign_key_check` (§3.3); fix any delete order the suite exposes and list it in the log | 0062, 0066 | ⬜ |
| 2.4 | `openDatabase` set-aside of schema 1–9 and pre-migration backups (TRD §3.3, §3.6), with tests for: v9 file set aside and empty start, failed copy refuses and deletes nothing, a test-only migration 11 gets a backup, `foreign_key_check` failure refuses | 0066 | ⬜ |
| 2.5 | Schema guard test with its shrinking list of unconverted tables, and the repository signature guard (TRD §11.1); both start with every data table listed as unconverted | 0062 | ⬜ |

## Checkpoint B: Phase 3 (sign-in and sessions)
**Plan:** ⬜ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 3** | **Sign-in and sessions** | | |
| 3.1 | Config: `ADMIN_EMAIL`, `APP_ORIGINS`, `SESSION_DAYS`, required Google and token variables, `GOOGLE_REDIRECT_URI` / `VAULT_PATH` removed with a `warn` (TRD §4.1); both `.env.example` files; `apps/server/CLAUDE.md` Environment | 0061 | ⬜ |
| 3.2 | `users`, `userModules`, `sessions`, `appSettings` repositories (TRD §3.4) and `seedUser` (§3.5), replacing 2.3's `seedDefaults()`; until Phase 4 gives profiles a `user_id`, `seedUser` seeds the shared rows once; tests including the one-admin index and per-user seeding | 0061, 0065 | ⬜ |
| 3.3 | `requestOrigin` (TRD §4.2): first record in the log what `tailscale serve` forwards (docs plus a manual request with Naresh); tests for loopback forwarded headers, direct requests and unknown origins | 0061 | ⬜ |
| 3.4 | `google-auth-library` added; `clients/googleSignIn.client.ts` behind an interface, with a fake for tests (TRD §4.3) | 0061 | ⬜ |
| 3.5 | `session.service.ts`, `middleware/auth.ts` (`requireUser`, `requireAdmin`, cookie parsing, sliding expiry), `jsonOnly`, `currentUser`, `req.user` typing, log context `user_id` (TRD §4.5–4.6); sweeper deletes expired sessions | 0061 | ⬜ |
| 3.6 | `auth.routes.ts` and `auth.service.ts`: google, callback (all TRD §11.1 cases, first-admin creation with `seedUser`), signout; `GET /api/me`; middleware order in `app.ts`; `test-support/auth.ts` and every existing route test switched to it | 0061, 0068 | ⬜ |

## Checkpoint C: Phase 4 (ownership)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

Each task adds `user_id` to its tables in the baseline (TRD §3.2), threads `userId` through repositories, services and controllers (§5.1), adds two-user repository and route isolation tests (§11.1), and removes its tables from the schema guard's unconverted list.

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Ownership** | | |
| 4.1 | Prompt profiles and versions; `settings` per user and `app_settings` (feed interval moved, admin-only write per TRD §5.4); settings service and prompt-profile routes | 0062, 0065 | ⬜ |
| 4.2 | Jobs, summary runs, link runs, link suggestions; jobs service, review, save (vault root still `config` until 5.1, behind one `vaultRootFor` stub returning the old path) | 0062 | ⬜ |
| 4.3 | Feeds, feed items, inbox; Gmail account (primary key `user_id`), sources, messages, job postings, sightings, extraction runs; Gmail OAuth `state` carries and checks the user; Gmail redirect per origin (TRD §4.2) | 0061, 0062 | ⬜ |
| 4.4 | Health split (TRD §3.2, §2.4): nullable `user_id` with the check, `recordCheck( userId \| null )`, `GET /api/status` per caller, app-kind refresh and **Back up now** admin-only | 0065 | ⬜ |
| 4.5 | Melete subjects, notes, questions, reviews, runs; per-user scan clock and single-flight (TRD §5.1) | 0062 | ⬜ |
| 4.6 | `requireModule` (TRD §5.3) on every module route, prompt-profile and settings filtering by module; the schema guard's unconverted list is now empty and the test asserts it; signature guard green | 0062, 0068 | ⬜ |

## Checkpoint D: Phase 5 (vaults, agent and loops)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 5** | **Vaults, agent and loops** | | |
| 5.1 | `config.vaultsPath`, real `vaultRootFor( user )` and `VaultNotChosenError` (TRD §7.1) used by save, the folder tree, folder create and Melete; Compose `VAULTS_HOST_PATH` mounts and the e2e override (§7.4); `docker compose config` passes | 0063 | ⬜ |
| 5.2 | `vaultOnboarding.service.ts` and the three `/api/me/vault*` routes (TRD §7.2), with claim races (unique constraint), symlinks, bad names and create rollback | 0063 | ⬜ |
| 5.3 | Agent contract `vault_dir` in one commit per ADR 0043 (Pydantic, JSON Schema export, golden examples, Zod mirror); `VAULTS_ROOT`, `vault_for`, the 422, `/health` (TRD §7.3, §11.2); `apps/agent/CLAUDE.md` | 0043, 0063 | ⬜ |
| 5.4 | `system.repository.ts` and the `eligible_users` view (TRD §6.1); worker round-robin, linking without a vault, intake poller, Melete generator, sweeper, service monitor, restart requeue (§6.2); loop tests in §11.1 | 0064 | ⬜ |

## Checkpoint E: Phase 6 (admin and usage)
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Admin and usage** | | |
| 6.1 | `admin.service.ts` and `admin.routes.ts` users: list, add with `seedUser`, update (remove deletes sessions, restore), reset vault, delete with confirm and cascade; self-target refused (TRD §8.1) | 0067 | ⬜ |
| 6.2 | `usage_events` view and `GET /api/admin/usage` with Singapore month bounds and transcription seconds (TRD §8.2) | 0067 | ⬜ |

## Checkpoint F: Phase 7 (web)
**Plan:** ⬜ [`plans/checkpoint-f.md`](plans/checkpoint-f.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Web** | | |
| 7.1 | `request.ts` JSON bodies and 401 handling; `me.api.ts`, `auth.api.ts`, `admin.api.ts` and keys (TRD §9.1) | 0068 | ⬜ |
| 7.2 | `AuthGate`, `SignIn` (with `?error=`), `/signin`, `NoModules` (TRD §9.2) | 0061, 0068 | ⬜ |
| 7.3 | `ChooseVault` (TRD §9.3) | 0063 | ⬜ |
| 7.4 | `RequireModule`, drawer filtering and **Sign out** (TRD §9.4) | 0068 | ⬜ |
| 7.5 | Settings tab filtering, Sources tab admin parts, index redirect (TRD §9.5) | 0065, 0068 | ⬜ |
| 7.6 | **Admin** tab: users table, add, module switches, remove/restore, reset vault, delete confirm, usage with month picker (TRD §9.5); `apps/web/CLAUDE.md` | 0067 | ⬜ |

## Checkpoint G: Phase 8 (e2e, docs and release)
**Plan:** ⬜ [`plans/checkpoint-g.md`](plans/checkpoint-g.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **e2e, docs and release** | | |
| 8.1 | `E2E_TEST_SIGNIN` session route with its startup guard and absence test; existing specs signed in as the admin; `multi-user.spec.ts` (TRD §11.4) | 0053, 0068 | ⬜ |
| 8.2 | `docs/google-cloud-setup.md`; `docs/phone-access.md` updates; README (users, sign-in, vaults, modules, Admin, variables, troubleshooting); root `CLAUDE.md` architecture paragraph and folders table (TRD §10) | 0061–0068 | ⬜ |
| 8.3 | Version 0.9.0 in every `package.json`, `apps/agent/pyproject.toml`, the agent's `uv.lock` entry and the README status line | | ⬜ |
| 8.4 | Final checks: all tests, lint, typecheck, build, browser tests, the agent's tests, `pnpm e2e`, `docker compose build`. With Naresh: move the vault to `~/Vaults/<name>`, upgrade (old database set aside), sign in as admin, choose the vault, add a member, sign in as the member over Tailscale from another device, claim or create a vault, check isolation by hand, toggle modules, check usage; on the iPhone, install the home-screen app and sign in from it (TRD §9.6) | 0061–0068 | ⬜ |
| 8.5 | `release-notes.md` from TRD §12, linked from `docs/README.md` | 0066 | ⬜ |

---

## Log

- 1.1: ADRs 0061–0068 set to Accepted; README index marks 0012 (by 0066), 0035 and 0060 (by 0061) amended, current version 0.9.0, v0.9.0 in progress; root CLAUDE.md first paragraph made multi-user.
