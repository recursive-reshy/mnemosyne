# Checkpoint B plan: Phase 3 (scanning and enrollment)

## Context
Checkpoint A (contracts, migration 9, repositories) is done. Checkpoint B makes Melete's server side usable without Claude or a UI: it scans the learning root in the vault (read-only, ADR 0054), tracks notes by path plus body hash (ADR 0057), enrolls notes and subjects, exposes the settings, and serves the first eight routes of TRD §10. Generation (C), scheduling and review (D) come later, so enrolling here only sets `generation = 'queued'`; nothing consumes the queue yet.

Order is fixed: 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6. After each task: tests, lint and typecheck in `apps/server` (and `packages/shared` only if touched; this checkpoint should not touch it or `apps/web`), tick Status, add a log line, commit (`feat(3.x): …`), push. No `pnpm e2e` (starts at F). No new dependency.

## Findings from reading the code (items that need your eye)
1. **`resolveFolder` creates folders** (`mkdir -p`), so using it for the learning root would write to the vault. TRD §4.1 and §9.2 say to use it ("must exist"). Plan: add `resolveExistingFolder( vaultPath, relativeFolder )` to `clients/vault.client.ts`. It applies the same `parseFolderPath` and `realpath`/`isInside` checks, never creates anything, and throws `ValidationError` ("Folder doesn't exist in the vault" / "outside the vault"). `isInside` becomes exported. 3.1 and 3.5 use it. This is an addition to an existing client, not a new dependency or endpoint, so I'll proceed unless you object.
2. **Prompt-profile list** (decided): `GET /api/prompt-profiles` keeps returning summary profiles by default; a `?purpose=` query (`summary` | `linker` | `melete_questions` | `melete_grading` | `all`) returns the others, each with `purpose`. No web change in B; 8.4 uses `all`. This narrows TRD §9.1's "lists them" and goes in the checkpoint report. `assertActiveProfile` already rejects non-summary ids because `listActiveProfiles()` defaults to `summary`, so "reject them as summary profiles" needs only a test, plus `resolvePrompt` ignoring Melete profiles like it ignores the linker.
3. **`new_remaining_today` in 3.4** can't use `dayStart` (task 5.2). Until 5.3 it is `min( new_per_day, new_available )` and totals' `learning_soon` is 0, as tasks.md 3.4 says ("without the queue yet"). 5.3 swaps it.
4. **Move detection edge cases the TRD leaves open** (I'll implement these and log them):
   - Two or more *new* paths with the same hash in one scan are copies, not a move: all inserted as new.
   - A *missing* note whose old path reappears (same or changed content) is restored in place, found by path among the rows from `listNotesUnder`, no new repository function.
   - Directory symlinks are not followed (avoids loops); file symlinks are followed only when `realpath` is inside the vault.
   - Subject name for `MeleteSubject.name` = last folder segment.
5. **Learning root read** (`getLearningRoot()`, sync, in `settings.service.ts`) is needed by 3.2 and not only 3.5; I'll add it in 3.2 and reuse it.
6. The 5000-file cap is a parameter (default 5000) so its test needs ten files, not 5001.

## Task 3.1: scan helpers and fixture vault
- **Tests first** (`melete/scan.test.ts`, `clients/vault.client.test.ts` additions, red on missing module/function):
  - `splitFrontMatter`: with front-matter; none; unterminated `---` → no front-matter; CRLF; `---` inside body; empty file.
  - `noteTitle`: front-matter `title` plain, quoted, with colon; non-string/empty/list value → file stem; no front-matter → stem; nested path.
  - `bodyHash`: CRLF = LF; trailing whitespace per line, outer blank lines ignored; inner change differs; front-matter-only change leaves hash equal (via split + hash); 64 hex chars.
  - `walkSubject`: nested `.md` files relative to the vault; skips `.obsidian`, `.trash`, non-Markdown, a symlink to a file outside the vault, a symlink dir; includes a file symlink inside the vault; cap exceeded → `ValidationError` naming the cap; returns `mtimeMs`, `size`.
  - `listSubjectFolders`: direct child folders only, dot-folders skipped, root-level notes ignored, sorted; learning root missing or outside the vault → `ValidationError`.
  - `resolveExistingFolder`: existing ok; missing → `ValidationError` and **nothing created**; `..` escape and a symlink out → `ValidationError`.
- **New** `test-support/meleteVault.fixture.ts`: builds a temp vault (two subjects, nested folders, notes with and without front-matter, `.obsidian/`, a `.png`, a symlink to a folder outside the vault) and returns `{ vaultPath, outsidePath, write, remove, rename, cleanup }` helpers for the scan tests; `afterEach` cleanup.
- **New** `melete/scan.ts`. **Edit** `clients/vault.client.ts` (`resolveExistingFolder`, export `isInside`).
- Commit: `feat(3.1): Melete vault scan helpers`.

## Task 3.2: `scanLearningRoot`
- **Tests first** (`services/meleteScan.service.test.ts`, real temp vault from the fixture, in-memory DB, fixed clock passed in; red on missing module). Cases from TRD §13.1: first scan (subjects and notes created, nothing enrolled); unchanged files not re-read (spy on `readFile`); edit of an enrolled note (questions retired via `retireActiveForNote`, `generation 'queued'`, error cleared); edit of an unenrolled note (hash updated, nothing queued); move within a subject, across subjects, and a whole subject folder renamed (ids and questions kept); delete → `missing_at` set → restore by path and by content; duplicates (two candidates → new note; two new paths same hash → both new); front-matter-only change (no retire, title/mtime updated); auto-enroll subject (new notes enrolled and queued); learning root changed and changed back (rows outside the root untouched and then reappear); the cap; symlink outside ignored; single-flight (two concurrent calls → one walk); 30-second rule (second call within 30 s does nothing, after 30 s scans, `force` bypasses); learning root unset → `ConflictError`; all DB writes in one transaction (a thrown write leaves state unchanged).
- **New** `services/meleteScan.service.ts`: `scanLearningRoot( { force?, now? } )`, `resetScanClock()`, in-memory last-scan time and the in-flight promise. Reads `getLearningRoot()` and `config.vaultPath`; reads files first, then applies steps 1–4 of TRD §4.2 in one `getDatabase().transaction`. Loads all notes under the root once with `listNotesUnder` and works on in-memory maps. **Edit** `settings.service.ts` (`getLearningRoot`).
- Commit: `feat(3.2): Melete learning-root scan`.

## Task 3.3: config
- **Tests first** (`config.test.ts` additions, red): defaults (`timeZone 'Asia/Singapore'`, `melete { requestRetention 0.9, dayStartHour 4, gradingTimeoutMs 20000, generationTimeoutMs 120000 }`, `obsidianVaultName undefined`); empty strings are unset; `APP_TIME_ZONE` invalid (`Mars/Base`) rejected via `Intl.DateTimeFormat`; `MELETE_REQUEST_RETENTION` 0.7 rejected, 0.99 accepted, 1 rejected; `MELETE_DAY_START_HOUR` -1 and 24 rejected, 0 and 23 accepted; non-integer hour rejected; `OBSIDIAN_VAULT_NAME` non-empty when set.
- **Edit** `config.ts` (schemas and the `config.melete`, `config.timeZone`, `config.obsidianVaultName` fields), `apps/server/.env.example` and root `.env.example`, `apps/server/CLAUDE.md` Environment section; any test that mocks `config.js` and builds a full config gets the new fields (named in the log line).
- Commit: `feat(3.3): Melete configuration`.

## Task 3.4: `melete.service.ts`
- **Tests first** (`services/melete.service.test.ts`, `meleteScan.service` mocked or real temp vault as convenient; red on missing module):
  - `setNoteEnrolled`: enrolling a note with no active questions → `enrolled`, `enrolled_at`, `generation 'queued'`; with active questions of the current hash → not queued; with active questions from an older hash → retired then queued; unenrolling keeps questions and `enrolled_at`; unknown id → `NotFoundError`; missing note → 409.
  - `setSubjectEnrolled`: forced scan first, every live note in one transaction, missing notes untouched; unenroll all.
  - `regenerateNote`: retires active questions, queues; 409 when not enrolled, `queued` or `generating`.
  - `retryGeneration`: only from `failed` (409 otherwise), clears the error.
  - `dropQuestion`: `active` → `dropped`, 409 otherwise, 404 unknown.
  - `updateSubject`: `auto_enroll` / `new_per_day`, 404 unknown.
  - `getToday`: learning root unset → `learning_root: null`, empty subjects; otherwise subjects ordered by name with note/enrolled/due/new counts and totals; `getSubject` / `getNote` shapes (`stale` = enrolled-or-not note with active questions whose `body_hash` differs from the note's; `missing`; `question_count` = active only; notes by path).
- **New** `services/meleteView.ts` is not needed; the `toMeleteSubject` / `toMeleteNote` mappers live in `melete.service.ts`. Uses the five repositories and `scanLearningRoot`.
- Commit: `feat(3.4): Melete enrollment and reads`.

## Task 3.5: settings and prompt profiles
- **Tests first** (`settings.service.test.ts`, `settings.routes.test.ts`, `prompts.service.test.ts`, `promptProfiles.routes.test.ts`; red):
  - `melete_learning_root`: set an existing folder → stored, scan clock reset; missing folder → 400 "Folder doesn't exist in the vault" and **no folder created**; `null` clears; outside-vault path → 400.
  - `melete_question_model` / `melete_grading_model`: unknown model → 400 (`assertKnownModel`); default is the newest Haiku else the shipped default (same rule as `linking_model`, extracted to one shared helper `resolveHaikuOr`, `resolveLinkingModel` behaviour unchanged); stored value wins.
  - `melete_review_mode`: stored value, default `typed`.
  - `GET /api/settings` carries the real ids and `locked_instructions.melete_*` (already true since 2.3; kept as regression).
  - Prompt profiles: `?purpose=all` lists summary + linker + both Melete profiles with `purpose`; default list unchanged (summary only); rename / delete a Melete profile → 409 "The Melete prompts can't be renamed or deleted"; linker message unchanged; save, restore and reset on a Melete profile work, reset restoring the §6.1 defaults by seed key; a Melete or linker id as `default_profile_id` or a job's `profile_id` → 400; `resolvePrompt` falls back to the default for a Melete id.
- **Edit** `settings.service.ts`, `prompts.service.ts` (`listProfiles( purpose )`, `resetProfile` knows the Melete defaults, rename/delete guard generalised), `promptProfiles.controller.ts` (parse `?purpose` with Zod), `promptProfiles.repository.ts` only if a list-all query is missing. `melete_*` settings keys already exist in the shared `UpdateSettingsBody` (2.2).
- Commit: `feat(3.5): Melete settings and prompt profiles`.

## Task 3.6: routes (first eight rows of TRD §10)
- **Tests first** (`routes/melete.routes.test.ts`, through `app.ts` with Supertest and a temp vault; red: 404): `GET /melete/today` (200 with and without a learning root); `GET /melete/subjects/:id` (200; 400 bad uuid; 404 unknown; 409 "Choose a learning root first"); `PATCH /melete/subjects/:id` (200; empty body 400); `POST /melete/subjects/:id/enrollment` (200 and notes queued); `GET /melete/notes/:id`, `PATCH /melete/notes/:id`, `POST /melete/notes/:id/regenerate` (202; 409 states), `POST /melete/notes/:id/retry` (202; 409 unless failed), `POST /melete/questions/:id/drop` (200 `{ question }`; 409). Every error status goes through the middleware.
- **New** `routes/melete.routes.ts`, `controllers/melete.controller.ts` (HTTP only, shared Zod bodies from 2.1, a local uuid param schema). **Edit** `app.ts` (mount). Review rows (`review/next`, `grade`, `review`) are task 5.5, not here.
- **Edit** `apps/server/CLAUDE.md`: folder structure lines for `melete/scan.ts`, `meleteScan`/`melete` services and routes, the new env variables; commit it with the task that adds the code (3.3, 3.6).
- Commit: `feat(3.6): Melete routes`.

## Reused code
`resolveFolder`/`isInside` rules (`clients/vault.client.ts`), `parseFolderPath` and `isValidFolderName` (`@mnemosyne/shared`), the five Melete repositories and `test-support/meleteData.fixture.ts` (2.4), `assertKnownModel` / `listModels` (`models.service.ts`), `getSetting` / `setSetting`, `toProfile` and the profile repository, `ConflictError` / `NotFoundError` / `ValidationError`, the Express four-layer pattern of `promptProfiles.*`.

## Verification
- Per task, in `apps/server`: `pnpm test`, `pnpm lint`, `pnpm typecheck`; `pnpm build` after 3.6. Shared and web are untouched (confirm with `git status`); if a shared contract turns out to need a change, stop and ask.
- Scan tests run against a real temp folder and an in-memory DB; no network, no Claude, nothing written under the vault by Melete code (a test asserts the vault tree is byte-identical before and after a scan).
- Checkpoint end: report commits, per-folder results, the two TRD deviations above (`resolveExistingFolder`, `?purpose` filter) and the 3.4 placeholder counts. No ADR expected; if you'd rather record the `?purpose` filter as one, say so and it becomes ADR 0061.
