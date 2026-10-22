# Tasks — Mnemosyne v0.8.0

Built from `prd.md` and `trd.md` in this folder. Tasks run strictly in order. Each one is test-first (ADR 0007) and ends in its own commit.

**Status:** ⬜ Not started · 🟨 In progress · ✅ Done (tests green, committed, pushed) · ⏸️ Deferred
**Plan:** ⬜ Not approved · ✅ Approved (the link points to the saved plan)

## How this file works
- Work is grouped into checkpoints. Each checkpoint covers one or more phases.
- **Start of a checkpoint:** in plan mode, write one plan for every task in it (files to touch, tests to write first, expected red → green path). Then stop. When Naresh approves it, save the plan to the linked file, tick the checkpoint's Plan cell, and commit.
- **During a checkpoint:** work through its tasks without stopping. For each task: failing tests first → green → refactor → tick Status → commit (`feat(<id>): …`, `refactor(<id>): …`, etc.) → push.
- **End of a checkpoint:** stop and report what was built, test/lint/typecheck results per package (and `test:browser` for web), browser screenshots (light and dark, and at phone width for Melete screens) of any screens touched, `pnpm e2e`, anything deferred, and any ADR that changes the TRD. Don't start the next checkpoint until Naresh says so.
- Never start a task whose checkpoint Plan cell is ⬜.
- If something isn't covered by the PRD, TRD or ADRs, stop and ask. Record the decision as the next ADR (from 0061) and add its number to the task's ADR column.
- **Melete never writes to the vault** (ADR 0054). A test or code path that writes under the vault from Melete code is a bug.
- **Dependencies:** only `ts-fsrs` in `apps/server` (TRD §1), added by the task that first uses it. Check its real API against the TRD first; if it differs in a way that changes the design, stop and ask.
- **No test touches the network, the Claude API or a real vault.** Melete tests use the fixture vault in a temp folder (TRD §13.1); the e2e stack uses local fakes and temp folders.
- Existing tests pass unchanged, except the changes TRD §13.1 allows; list each one in the log line.
- Add a one-line note to the log at the bottom whenever a task is ticked.

---

## Checkpoint A: Phases 1–2 (kick-off, contracts and data)
**Plan:** ✅ [`plans/checkpoint-a.md`](plans/checkpoint-a.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 1** | **Kick-off** | | |
| 1.1 | Set ADRs 0054–0060 to Accepted (Status lines and the `docs/README.md` index); `docs/README.md` current version 0.8.0 and the v0.8.0 entry "in progress". The root `CLAUDE.md` already points at 0.8.0 (updated with these docs) | 0054–0060 | ✅ |
| **Phase 2** | **Contracts and data** | | |
| 2.1 | Shared `melete.ts` (TRD §2.1) with schema tests; exported from `index.ts` | 0054, 0056, 0058 | ✅ |
| 2.2 | Shared `summarizer.ts` and `job.ts` additions: Melete settings keys and `UpdateSettingsBody`, `locked_instructions.melete_*`, `SeedKey` `study`, `PromptProfile.purpose`, `Job.default_folder` (TRD §2.2–2.3); fixtures and tests that list every key updated | 0058, 0059 | ✅ |
| 2.3 | Migration 9 `addMelete`: tables, indexes, `prompt_profiles.last_folder`, seeded Study and Melete profiles with version 1 (the "Study (seeded)" name clash case); tested from version 8 with data and from empty (TRD §3.1). The §6.1 and §8 default texts go in `melete/prompts.ts` and `summarizer/prompts.ts` in this task | 0058, 0059 | ✅ |
| 2.4 | Repositories `meleteSubjects`, `meleteNotes`, `meleteQuestions`, `meleteReviews`, `meleteRuns`; `promptProfiles` `last_folder` and `setLastFolder`; `apps/server/CLAUDE.md` (TRD §3.2) | 0058 | ✅ |

## Checkpoint B: Phase 3 (scanning and enrollment)
**Plan:** ✅ [`plans/checkpoint-b.md`](plans/checkpoint-b.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 3** | **Scanning and enrollment** | | |
| 3.1 | `test-support/meleteVault.fixture.ts`; `melete/scan.ts`: `splitFrontMatter`, `noteTitle`, `bodyHash`, `walkSubject`, `listSubjectFolders` with the vault path rules (TRD §4.1) | 0057 | ✅ |
| 3.2 | `meleteScan.service.ts` `scanLearningRoot`: subjects, skip by mtime/size, edits, moves, missing and restore, duplicates, auto-enroll, single-flight and the 30-second rule (TRD §4.2, scan tests in §13.1) | 0057 | ✅ |
| 3.3 | Config: `APP_TIME_ZONE`, `MELETE_*`, `OBSIDIAN_VAULT_NAME` with validation; both `.env.example` files (TRD §9.3) | 0056 | ⬜ |
| 3.4 | `melete.service.ts` enrollment: `setNoteEnrolled`, `setSubjectEnrolled`, `regenerateNote`, `retryGeneration`, `dropQuestion`, `updateSubject`; `getToday` and `getSubject` / `getNote` reads (counts without the queue yet: due and new from the repositories) (TRD §4.3, §7.2) | 0057 | ⬜ |
| 3.5 | Settings service: `melete_learning_root` (exists-in-vault check, scan reset), the two models with the Haiku fallback, `melete_review_mode`, profile ids, locked instructions; prompt-profile routes list Melete profiles with `purpose`, refuse rename/delete, reject them as summary profiles (TRD §9) | 0055 | ⬜ |
| 3.6 | `melete.routes.ts` and controller for today, subjects, enrollment, notes, regenerate, retry, drop (TRD §10, first eight rows); mounted in `app.ts` | 0054 | ⬜ |

## Checkpoint C: Phase 4 (question generation)
**Plan:** ⬜ [`plans/checkpoint-c.md`](plans/checkpoint-c.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 4** | **Question generation** | | |
| 4.1 | `melete/prompts.ts` `buildMeleteSystemPrompt`, `resolveMeletePrompt`; `claude.client.ts` `generateQuestions` and `MeleteError`, fixture-based tests as for `summarizeSource`; one real-API integration test skipped without a key, beside `claude.integration.test.ts` (TRD §6.1–6.3) | 0055 | ⬜ |
| 4.2 | `melete/questions.ts` post-processing (trim, drop empties, cap, passage check, positions) (TRD §6.4) | 0055 | ⬜ |
| 4.3 | `meleteGeneration.service.ts` `generateForNote`: re-read, hash check, length guard, run recording with cost, insert in one transaction, failures (TRD §6.2, §6.5, §7.5) | 0055, 0058 | ⬜ |
| 4.4 | `worker/meleteGenerator.ts`: the loop, restart requeue, log context; started in `server.ts`, stopped in `shutdown.ts` (TRD §7.5) | 0058 | ⬜ |

## Checkpoint D: Phase 5 (scheduling and review)
**Plan:** ⬜ [`plans/checkpoint-d.md`](plans/checkpoint-d.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 5** | **Scheduling and review** | | |
| 5.1 | `ts-fsrs` added to `apps/server`; `melete/scheduler.ts` (`newCard`, `nextCard`, `toRow`, `fromRow`, rating map, injectable no-fuzz scheduler); record in the log line how `elapsed_days` behaves when restored as 0 (TRD §5.1) | 0056 | ⬜ |
| 5.2 | `melete/day.ts` `dayStart` (time zone, start hour, DST-free zone and a DST zone in tests) (TRD §5.3) | 0056 | ⬜ |
| 5.3 | `meleteReview.service.ts` `getNextReview` and counts; `getToday` switched to the queue's counts (TRD §7.1–7.2, queue tests in §13.1) | 0056 | ⬜ |
| 5.4 | `claude.client.ts` `gradeAnswer`; `gradeAnswer` service with the blank rule; `recordReview` with the card update, review row, `was_new`, `grade_run_id` check and review-mode setting (TRD §6.3, §7.3–7.4) | 0055, 0056 | ⬜ |
| 5.5 | Routes: `review/next`, `grade`, `review` (TRD §10, last three rows), with `obsidian_url` | 0054 | ⬜ |

## Checkpoint E: Phase 6 (Study profile and folder memory)
**Plan:** ⬜ [`plans/checkpoint-e.md`](plans/checkpoint-e.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 6** | **Study profile and folder memory** | | |
| 6.1 | Study in `SEEDED_PROFILES` (migration 9 already seeds it everywhere; this makes reset-to-default and the seeded-profile code treat it like the other three); the seeded-profile tests (TRD §8) | 0059 | ⬜ |
| 6.2 | Server: `defaultFolderFor`, `Job.default_folder` for review jobs, `saveJob` remembers the folder after a successful write (TRD §8) | 0059 | ⬜ |
| 6.3 | Web: `NoteDestination` and `FilenamePreview` on `job.default_folder` (TRD §8) | 0059 | ⬜ |

## Checkpoint F: Phase 7 (Melete pages)
**Plan:** ⬜ [`plans/checkpoint-f.md`](plans/checkpoint-f.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 7** | **Melete pages** | | |
| 7.1 | `api/melete.api.ts`, `meleteKeys`, the hooks with cache updates and generation polling (TRD §11.1) | 0054 | ⬜ |
| 7.2 | Routes and the **Melete** drawer item (current on `/melete/*`, collapsed tooltip) (TRD §11.1) | 0054 | ⬜ |
| 7.3 | `MeleteToday` and `LearningRootSetup` (TRD §11.2) | 0054 | ⬜ |
| 7.4 | `MeleteSubject` (TRD §11.2) | 0057 | ⬜ |
| 7.5 | `MeleteNote` (TRD §11.2) | 0057 | ⬜ |

## Checkpoint G: Phase 8 (review screen and Settings)
**Plan:** ⬜ [`plans/checkpoint-g.md`](plans/checkpoint-g.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 8** | **Review screen and Settings** | | |
| 8.1 | `RatingBar` (sticky, safe-area padding, pre-selection, Next, keys 1–4 and Enter) (TRD §11.3) | 0060 | ⬜ |
| 8.2 | `MeleteReview` typed mode with `GradeFeedback` (graded, skipped, failed), quick mode, mode toggle, drop, all-done state (TRD §11.3) | 0056 | ⬜ |
| 8.3 | `MeleteReview.browser.test.tsx` at phone and desktop sizes, Chromium and WebKit (TRD §13.2) | 0060 | ⬜ |
| 8.4 | Prompts tab grouped by `purpose` with the Melete prompts; Models tab **Melete** section; `apps/web/CLAUDE.md` (TRD §11.4) | 0055 | ⬜ |

## Checkpoint H: Phase 9 (phone access and e2e)
**Plan:** ⬜ [`plans/checkpoint-h.md`](plans/checkpoint-h.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 9** | **Phone access and e2e** | | |
| 9.1 | `manifest.webmanifest`, the icons already in `public/icons/`, `index.html` meta and `viewport-fit=cover`; manifest unit test; `/manifest.webmanifest` content-type test in the server (TRD §11.5) | 0060 | ⬜ |
| 9.2 | Compose `127.0.0.1:3100:3100`; check the e2e override still publishes 3101; `docker compose config` passes (TRD §12) | 0060 | ⬜ |
| 9.3 | `docs/phone-access.md`, commands and menu names checked against Tailscale's current docs with the date; README link (TRD §12) | 0060 | ⬜ |
| 9.4 | e2e: fakes tell Melete requests apart (with unit tests), `run.sh` seeds `Learning/E2E/Recall.md`, `melete.spec.ts` on Pixel 7 (TRD §13.3) | 0053, 0060 | ⬜ |

## Checkpoint I: Phase 10 (clean-up and release)
**Plan:** ⬜ [`plans/checkpoint-i.md`](plans/checkpoint-i.md)

| ID | Task | ADRs | Status |
| --- | --- | --- | --- |
| **Phase 10** | **Clean-up and release** | | |
| 10.1 | README: Melete (learning root, subjects, enrollment, review modes, Today), the Study profile, folder memory, phone access link, new variables, troubleshooting; root `CLAUDE.md` folders table and architecture paragraph (Melete) | 0054–0060 | ⬜ |
| 10.2 | Version 0.8.0 in every `package.json`, `apps/agent/pyproject.toml`, the agent's `uv.lock` entry and the README status line | | ⬜ |
| 10.3 | Final checks: all tests, lint, typecheck, build, browser tests, the agent's `docker` tests, `pnpm e2e`, `docker compose build`. With Naresh: back up the real 0.7.1 database, run migration 9 on a copy; in Docker, set the learning root, make a subject folder in Obsidian, summarize a video with Study (picker remembers the folder on the next one), enroll, review on the phone over Tailscale from the home-screen icon in both modes, edit a note in Obsidian and see its questions regenerate, move a note to another subject and keep its history | 0054–0060 | ⬜ |
| 10.4 | `release-notes.md` (upgrade steps: back up the database first, optional `OBSIDIAN_VAULT_NAME`, `docker compose up -d --build`, the port is now localhost-only, phone access guide), linked from `docs/README.md` | 0060 | ⬜ |

---

## Log

- 1.1 ✅ ADRs 0054–0060 set to Accepted (Status lines and the `docs/README.md` index); `docs/README.md` current version 0.8.0 and the v0.8.0 entry "in progress". Root `CLAUDE.md` already pointed at 0.8.0. Docs only: no code, so no test run.
- 2.1 ✅ `packages/shared/src/melete.ts` per TRD §2.1 (enums, subject, note, question, review item and counts, grade, Claude output formats, all request and response bodies), exported from `index.ts`. Red first: `melete.test.ts` failed on the missing module; green after. `MeleteGradeOutput` is the same schema as `MeleteGrade`. shared 607 tests; lint and typecheck green. No existing test changed.
- 2.2 ✅ Shared: `Settings` gains the six `melete_*` keys, `UpdateSettingsBody` the four writable ones (learning root checked with `isValidFolderName` per segment, null allowed, empty refused; refine message lists them), `locked_instructions.melete_questions` / `.melete_grading`, `PromptProfile.purpose` (new `PromptPurpose`), `Job.default_folder`. Red first: 13 new shared tests failed, then green. Server: `StoredJob` omits `default_folder` (it is computed, not stored); `toPublicJob` sets it to `config.defaultNoteFolder` for now (real value in 6.2); `toProfile` passes `purpose`; `getSettings` reads the Melete settings with defaults (learning root null, both models the shipped default until 3.5, mode `typed`) and uses a nil-UUID placeholder for the two Melete profile ids and empty strings for the two locked instructions, to be replaced in 2.3 and 3.5. Existing tests changed (TRD §13.1, contract gained fields): shared `api`, `inbox`, `linkSuggestions`, `job` and `summarizer` fixtures; server `settings.service`, `settings.routes`, `jobs.service` (queueJob result), `article.adapter` and `video.adapter` tests; web `job.fixture`, `summarizer.fixture` and `SummarizerDefaults.test`. shared 624, server 2028, web 1282 tests; lint and typecheck green in all three.
- 2.3 ✅ Migration 9 `addMelete` (the five `melete_*` tables, their indexes, `prompt_profiles.last_folder`, and the Study, Melete questions and Melete grading profiles, each with version 1 from the constants; a seed key that already exists is skipped). `melete/prompts.ts` (locked instructions, default guidance, seed keys, `buildMeleteSystemPrompt`) and `STUDY_GUIDANCE` / `STUDY_SEED_KEY` in `summarizer/prompts.ts`; Study is not in `SEEDED_PROFILES` yet (6.1). Tested from version 8 with data and from empty, name clash, rollback. `getSettings` now returns the real Melete profile ids and `getLockedInstructions` the real locked texts (the 2.2 placeholders are gone); `ProfilePurpose` is now the shared `PromptPurpose` (needed so `findProfileBySeedKey` can read the new rows; the rest of 2.4 follows). Correction to the plan: profile names are unique per purpose since migration 7, so only Study (a summary profile) can clash and only it gets the "(seeded)" suffix. Existing tests changed (TRD §13.1, lists every migration or profile): `database.test.ts` migration 8 tests pinned to the first 8 migrations; `promptProfiles.repository`, `promptProfiles.routes` and `prompts.service` tests now expect Study as a fourth summary profile (so counts go 3→4); `settings.service` and `settings.routes` tests expect the real ids and locked texts. shared 624, server 2066, web 1282 tests; lint, typecheck and build green.
- 2.4 ✅ Repositories `meleteSubjects`, `meleteNotes`, `meleteQuestions`, `meleteReviews`, `meleteRuns` (synchronous, Zod-parsed rows, as `linkRuns`) and `promptProfiles` `last_folder` + `setLastFolder`; `apps/server/CLAUDE.md` updated (repositories line, `melete/` folder and the read-only vault rule, ADRs 0054 and 0058). Red first: every new repository test failed on a missing module and the `last_folder` tests on a missing function, then green. Choices the TRD leaves open: `listNotesUnder` uses a path range (`>= "prefix/"` and `< "prefix0"`) so `%` and `_` in folder names are literal; unenrolling keeps `enrolled_at`; `listDue` also returns a new question that was served (due set) but not yet rated, so a reload resumes it; `countBySubject` returns a row for every subject, zeros included; `listForNote` returns active and dropped questions, never retired; `insertQuestions` numbers positions 1..n and is all-or-nothing; the queue queries return `subject_id` with each question. Test helper `test-support/meleteData.fixture.ts` inserts subjects, notes and questions. Existing test changed: `promptProfiles.repository.test.ts` expects `last_folder: null` on a profile record. shared 624, server 2135, web 1282 tests; lint, typecheck and build green.
- 3.1 ✅ `melete/scan.ts` (`splitFrontMatter`, `noteTitle`, `bodyHash`, `walkSubject`, `listSubjectFolders`) and `test-support/meleteVault.fixture.ts` (temp vault with two subjects, a dot-folder, a PNG, a root-level note, and links out of the vault). Red first: both test files failed on the missing functions, then green. TRD deviation (checkpoint plan finding 1): `resolveFolder` creates folders, so Melete uses a new non-creating `resolveExistingFolder` in `vault.client.ts` (same parse, `realpath` and `isInside` checks; "Folder doesn't exist in the vault" when missing); `isInside` is now exported. Choices the TRD leaves open: directory links are not followed, file links only when they end at a file inside the vault, dot-files are skipped like dot-folders, the cap is a parameter (default 5000). No existing test changed. server 2177 tests; lint and typecheck green.
- 3.2 ✅ `services/meleteScan.service.ts` `scanLearningRoot( { force, now } )` and `resetScanClock()`; `getLearningRoot()` added to `settings.service.ts` (also used by `getSettings`; an empty string now reads as unset). Red first (module missing), then green: 29 tests on a real temp vault covering the TRD §13.1 scan list (first scan, skip by mtime/size, edit of enrolled and unenrolled notes, front-matter-only change, moves within and across subjects and of a whole subject folder, missing, restore by path and by content, duplicates, auto-enrol, learning root changed and back, 30-second rule, `force`, single-flight, unset and missing root, rollback on a failed write, a file that vanishes mid-scan) plus a check that the vault tree is unchanged by a scan. The 5000 cap is tested in 3.1. Choices the TRD leaves open: two or more new files with one body are never a move; a missing note whose path reappears is restored in place (questions retired and generation queued if its body changed and it is enrolled); a file that disappears between walk and read is skipped until the next scan. No existing test changed. server 2206 tests; lint and typecheck green.
