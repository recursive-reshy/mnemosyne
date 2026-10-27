# Checkpoint E plan: Phase 6 (admin and usage)

## Context
Checkpoints A–D gave every table an owner, gated modules and gave each user a vault. The admin routes that Naresh uses to add his brother, switch modules, remove/restore, reset a vault, delete, and see usage don't exist yet (ADR 0067; TRD §8, §11.1 "Admin"). Checkpoint E adds them on the server only (web is F). Two tasks, one commit each (`feat(0.9-6.x): …`, co-author trailer), pushed. After each task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server` (and `packages/shared` if touched); `pnpm build` at the end. `pnpm e2e` is not required before F.

Existing pieces reused: `requireAdmin` (`middleware/auth.ts`), `AdminUser`/`CreateUserBody`/`UpdateUserBody`/`DeleteUserBody`/`Usage*` (`packages/shared/src/admin.ts`, already there), `insertUser`/`updateUser`/`listUsers`/`clearVaultDir`/`deleteUser` (`users.repository.ts`), `listModules`/`setModules`, `deleteSessionsForUser`, `seedUser`, `inTransaction`, `ConflictError`/`NotFoundError`/`ValidationError`, `createTestUser`/`signedIn` (`test-support/auth.ts`), `config.timeZone`.

Every task: failing tests first, watch them fail for the right reason, least code, refactor green, tick Status, log line in `tasks.md`, commit, push. No new dependency.

## Decisions to confirm
1. **Transcription seconds need a stored duration (decision made).** Saving sets `source_document: null` (`jobs.service.ts:768`), so TRD §8.2's "stored duration" would vanish for saved jobs. Per your answer: add `jobs.duration_seconds INTEGER` (nullable) to the baseline schema in `database.ts` (ADR 0066: no live 0.9 database yet), set it where a video source document is stored (`jobs.service.ts` around lines 324/378/648, via `jobRows.ts` and `jobStore.repository.ts` insert/update), and sum it for usage. This is a schema change not in the TRD, so I write **ADR 0069** (jobs keep the video's duration; amends TRD §3.2 and §8.2), add it to `docs/README.md` and to task 6.2's ADR column. Articles have null. Month bucket by `jobs.created_at`.
2. **`UpdateUserBody` with `modules` for a removed user** is allowed (admin may prepare it before restoring). Targeting the admin with PATCH, reset-vault or DELETE → 409 "You can't change your own account here".
3. **Error mapping for DELETE:** non-removed user → 409; `confirm` ≠ email → 400 (`ValidationError`); unknown ID → 404.
4. **Month validation:** `month` query must match `YYYY-MM` (else 400); default is the current month in `config.timeZone`.

## 6.1 Admin users routes
- **Tests first (red):**
  - `services/admin.service.test.ts` + `routes/admin.routes.test.ts`:
    - Every route as member → 404, as signed-out → 401, as admin works.
    - `GET /api/admin/users`: admin first, then by name; `AdminUser` shape (modules for admin = all; members from `user_modules`; `vault_dir`, `last_signin_at`).
    - `POST`: 201 with member/active, modules stored, seeded profiles and `default_profile_id` present; duplicate email (any case) → 409; bad email/empty name/bad module → 400; a failure inside (forced: `seedUser` throws) leaves no user row, modules or profiles (one transaction).
    - `PATCH`: name, modules, status each alone and together; empty body → 400; `removed` deletes that user's sessions in the same transaction and a following request with their cookie → 401; `active` restores with data intact; modules replacement; target admin (self) → 409; unknown ID → 404.
    - `POST …/reset-vault`: clears `vault_dir`, `/api/me` for that user shows null, vault folder and Melete rows untouched; self → 409; unknown → 404.
    - `DELETE`: active user → 409; wrong confirm → 400; removed + right confirm → 204; **cascade test**: seed A with rows in every user-owned table (jobs, runs, settings, profiles, feeds, melete, health…) and B likewise; after deleting A every table has no A rows (iterate `sqlite_master` tables having `user_id`) and B's counts are unchanged; vault folder still exists; self → 409.
  - Isolation: no admin route returns another user's content (response shapes contain only `AdminUser` fields).
- **Code:** `services/admin.service.ts` (`listAdminUsers`, `createUser( body, now )`, `updateUser( adminId, id, body )`, `resetVault`, `deleteUserAccount`), `controllers/admin.controller.ts`, `routes/admin.routes.ts` mounted in `app.ts` after `meRoutes` as `app.use( '/api/admin', requireAdmin, adminRoutes )` (before the module routers, so it never hits module gating); `users.repository.ts` gets a `updateUser` that also accepts nothing new (modules go through `setModules`). Mapping `StoredUser` + modules → `AdminUser` in the service.
- **Docs:** `apps/server/CLAUDE.md` (admin routes, service).
- **Commit:** `feat(0.9-6.1): admin users`.

## 6.2 Usage rollup
- **Tests first:**
  - `database.schema.test.ts`: `usage_events` view exists with columns `user_id, category, input_tokens, output_tokens, cost_usd, created_at`; `jobs.duration_seconds` exists.
  - `jobs.service` tests: a video job stores `duration_seconds` from the transcript meta; an article leaves it null; the value survives save (source_document null).
  - `admin.service.test.ts` usage: two users with runs in all four categories; month vs all-time totals; `cost_usd` null when every run in a bucket is null and a sum when mixed; runs counted; tokens null treated as 0; users with no activity still appear with zero totals; **Singapore boundary**: runs at `2026-09-30T15:59:59Z` (30 Sep SGT) and `2026-09-30T16:00:00Z` (1 Oct SGT) land in September and October respectively; default month is the current month in `APP_TIME_ZONE` (fake clock); a different `APP_TIME_ZONE` shifts the bounds; `month=2026-13`/`abc` → 400; transcription seconds sum video jobs only, month by `created_at`, all-time across months, saved jobs included.
  - Route: admin 200 `UsageResponse` (`time_zone` echoed), member 404.
- **Code:**
  - `database.ts` baseline: `jobs.duration_seconds INTEGER`; `CREATE VIEW usage_events AS` `UNION ALL` of `summary_runs` ('summary'), `link_runs` ('linking'), `melete_runs` ('melete'), `extraction_runs` ('extraction') selecting the columns above.
  - `jobRows.ts`, `jobStore.repository.ts`, `jobs.service.ts`: write the duration alongside a stored video document.
  - `admin.service.ts`: `monthBounds( month, timeZone )` (UTC ISO start/end computed from the zone's offset at the month's start and end; DST-safe via `Intl`), grouped `SUM`/`COUNT` queries for month and all time, transcription sums; `GET /api/admin/usage` in `admin.routes.ts`. Queries over `usage_events` are admin-only aggregates and live in `admin.service.ts`/a small `usage.repository.ts` that is added to the signature guard's exempt list (the TRD names four exempt repositories; adding a fifth is a deviation, so I'll put the cross-user queries in `system.repository.ts` instead, which is already exempt).
  - **ADR 0069** + `docs/README.md` index; `docs/decisions` link in task 6.2.
- **Commit:** `feat(0.9-6.2): usage rollup`.

## Verification
`pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/server` and `packages/shared` after each task; `pnpm build` at the end; no e2e (needs 8.1). Checkpoint report: commits, results, ADR 0069 amends TRD §3.2 and §8.2, nothing deferred.
