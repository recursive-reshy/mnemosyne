# Mnemosyne v0.8.0 — Technical Requirements

Companion to `docs/v0.8.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.7.1 code at commit `c85710b`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet. The module is **Melete** everywhere: routes (`/melete`, `/api/melete`), tables (`melete_*`), folders and files (`melete/`, `melete*.service.ts`), prompt purposes (`melete_questions`, `melete_grading`) and the UI. A vault note Melete tracks is a **note**; a stored quiz item is a **question**; one rating of a question is a **review**; one Claude call is a **run**.

## 1. Changes at a glance
- **Module boundary** (ADR 0054): Melete is a module of the same server, web app and database. It owns its `melete_*` tables, reads the vault and never writes to it. Mnemosyne's ingest code doesn't import Melete, and Melete imports only shared clients (vault path checks, Claude, pricing, prompts).
- **Where it runs** (ADR 0055): question generation and grading are single Claude calls in Express, not agent-service endpoints. `apps/agent` is unchanged.
- **Scheduling** (ADR 0056): FSRS through `ts-fsrs`, 90% target recall, fuzz on.
- **Note identity** (ADR 0057): path plus a body hash, move detection, on-demand scans of the learning root. No file watcher, no background poll.
- **Generator loop and data** (ADR 0058): a Melete generator loop beside the worker, its own queue on `melete_notes`; migration 9 adds the `melete_*` tables.
- **Study profile and folder memory** (ADR 0059): a seeded **Study** summary profile; the folder picker defaults to the last folder used with the job's prompt profile.
- **Phone access** (ADR 0060): Compose binds the app to `127.0.0.1`; Tailscale Serve (documented, not coded) gives a private HTTPS address; a web app manifest and icons make it installable. No service worker.
- **Shared:** `melete.ts` (new); `summarizer.ts` gains the Melete settings, locked instructions and the `study` seed key; `job.ts` gains `default_folder`.
- **Server:** migration 9; `melete/` (scan, hashing, scheduling, queue building, prompts, Claude calls); Melete repositories, services, controllers and routes; `worker/meleteGenerator.ts`; settings and prompt-profile additions; folder memory on save.
- **Web:** routes `/melete`, `/melete/subjects/:subjectId`, `/melete/notes/:noteId`, `/melete/review`; a **Melete** drawer item; Melete prompts in the Prompts tab; a Melete section in the Models tab; `manifest.webmanifest`, icons and `index.html` meta.
- **New dependencies** (and only these):
  - server: `ts-fsrs` (`^5.4.2`, MIT, no runtime dependencies, Node ≥ 20).
  - web, shared, agent, e2e: none.
  - Check `ts-fsrs`'s real API against §5 before using it; if it differs in a way that changes the design, stop and ask.
- **Environment (server):** `OBSIDIAN_VAULT_NAME` (optional), `APP_TIME_ZONE` (default `Asia/Singapore`), `MELETE_DAY_START_HOUR` (default 4), `MELETE_REQUEST_RETENTION` (default 0.9), `MELETE_GRADING_TIMEOUT_MS` (default 20_000), `MELETE_GENERATION_TIMEOUT_MS` (default 120_000).
- **Docker:** `ports: "127.0.0.1:3100:3100"` on `mnemosyne`. Nothing else changes.

## 2. Shared contracts (`packages/shared`)

### 2.1 Melete (`melete.ts`, new)
```ts
MeleteRating        = 'again' | 'hard' | 'good' | 'easy'
MeleteReviewMode    = 'typed' | 'quick'
MeleteGeneration    = 'idle' | 'queued' | 'generating' | 'failed'
MeleteQuestionState = 'active' | 'dropped' | 'retired'
MeleteFsrsState     = 'new' | 'learning' | 'review' | 'relearning'

MeleteSubject = { id: uuid, name: string, folder: string,          // folder relative to the vault, e.g. "Learning/TypeScript"
                  auto_enroll: boolean, new_per_day: int (0..100),
                  note_count: int, enrolled_count: int,
                  due_count: int, new_available: int, new_remaining_today: int }

MeleteNote = { id: uuid, subject_id: uuid, path: string, title: string,
               enrolled: boolean, generation: MeleteGeneration, generation_error: string | null,
               question_count: int,                                  // active questions
               stale: boolean,                                       // enrolled questions made from an older body
               missing: boolean }

MeleteQuestion = { id: uuid, note_id: uuid, position: int, prompt: string, answer: string,
                   passage: string,                                  // '' when no verbatim passage
                   state: MeleteQuestionState, fsrs_state: MeleteFsrsState,
                   due: iso | null, reps: int, lapses: int, last_review: iso | null }

MeleteReviewItem = { question: MeleteQuestion, note: { id, title, path, subject_name },
                     obsidian_url: string | null }                   // null when OBSIDIAN_VAULT_NAME is unset
MeleteReviewCounts = { due: int, new_remaining: int, learning_soon: int }

MeleteGrade = { verdict: 'correct' | 'partial' | 'incorrect', right: string[] (max 6), missed: string[] (max 6),
                feedback: string (1..600), suggested_rating: 'again' | 'hard' | 'good' }

// Claude output formats (§6.3)
MeleteQuestionsOutput = { questions: { prompt: string (1..500), answer: string (1..1500), passage: string (0..1500) }[] (1..10) }
MeleteGradeOutput     = MeleteGrade

// API
GetMeleteTodayResponse    = { learning_root: string | null, subjects: MeleteSubject[], totals: MeleteReviewCounts }
GetMeleteSubjectResponse  = { subject: MeleteSubject, notes: MeleteNote[] }       // notes by path
UpdateMeleteSubjectBody   = { auto_enroll?: boolean, new_per_day?: int (0..100) }  // at least one key
EnrollSubjectBody         = { enrolled: boolean }
UpdateMeleteNoteBody      = { enrolled: boolean }
GetMeleteNoteResponse     = { note: MeleteNote, questions: MeleteQuestion[] }     // active and dropped, by position
GetNextReviewResponse     = { item: MeleteReviewItem | null, counts: MeleteReviewCounts }
GradeAnswerBody           = { answer: string (0..4000) }
GradeAnswerResponse       = { outcome: 'graded', grade: MeleteGrade, run_id: int }
                          | { outcome: 'skipped', reason: 'blank' }                // §7.3
                          | { outcome: 'failed', reason: string, run_id: int | null }
RecordReviewBody          = { rating: MeleteRating, mode: MeleteReviewMode, answer?: string (0..4000),
                              grade_run_id?: int, suggested_rating?: 'again' | 'hard' | 'good' }
RecordReviewResponse      = { question: MeleteQuestion, counts: MeleteReviewCounts }
```
Exported from `index.ts`. Schema tests for each, including the refine on `UpdateMeleteSubjectBody` and the `GradeAnswerResponse` union.

### 2.2 Settings (`summarizer.ts`)
- `Settings` gains `melete_learning_root: string | null`, `melete_question_model: string`, `melete_grading_model: string`, `melete_review_mode: MeleteReviewMode`, `melete_question_profile_id: uuid`, `melete_grading_profile_id: uuid`.
- `UpdateSettingsBody` accepts `melete_learning_root` (a folder path validated with `parseFolderPath`, or null), `melete_question_model` and `melete_grading_model` (`assertKnownModel`), `melete_review_mode`. The profile ids are read-only. The refine message lists the new keys.
- `GetSettingsResponse.locked_instructions` gains `melete_questions` and `melete_grading` (server constants, so never null).
- `SeedKey` gains `'study'`. The prompt-profile `purpose` values (server-side) gain `melete_questions` and `melete_grading`; `PromptProfile` gains `purpose` in the response so the Prompts tab can group the list (ADR 0052's list already groups summary profiles and the linker).

### 2.3 Jobs (`job.ts`)
- `Job` gains `default_folder: string`: the folder the picker starts on and the save uses when `target_folder` is null (§8).

## 3. Data (SQLite)

### 3.1 Migration 9 (a function migration, `addMelete`)
```sql
CREATE TABLE melete_subjects (
  id TEXT PRIMARY KEY,
  folder TEXT NOT NULL UNIQUE,              -- relative to the vault
  auto_enroll INTEGER NOT NULL DEFAULT 0,
  new_per_day INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL
);

CREATE TABLE melete_notes (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES melete_subjects ( id ),
  path TEXT NOT NULL,                       -- relative to the vault
  title TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  size INTEGER NOT NULL,
  enrolled INTEGER NOT NULL DEFAULT 0,
  enrolled_at TEXT,
  generation TEXT NOT NULL DEFAULT 'idle',
  generation_error TEXT,
  missing_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX melete_notes_path ON melete_notes ( path ) WHERE missing_at IS NULL;
CREATE INDEX melete_notes_hash ON melete_notes ( body_hash );
CREATE INDEX melete_notes_queue ON melete_notes ( generation, enrolled_at );

CREATE TABLE melete_questions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES melete_notes ( id ),
  position INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  passage TEXT NOT NULL,
  body_hash TEXT NOT NULL,                  -- the note body it was made from
  state TEXT NOT NULL,                      -- active | dropped | retired
  run_id INTEGER NOT NULL,                  -- the generation run
  due TEXT,                                 -- FSRS card (§5.2); null until first scheduled
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  fsrs_state TEXT NOT NULL DEFAULT 'new',
  last_review TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX melete_questions_note ON melete_questions ( note_id, state, position );
CREATE INDEX melete_questions_due ON melete_questions ( state, due );

CREATE TABLE melete_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES melete_questions ( id ),
  reviewed_at TEXT NOT NULL,
  mode TEXT NOT NULL,
  rating TEXT NOT NULL,
  suggested_rating TEXT,
  answer TEXT,
  grade_run_id INTEGER,
  was_new INTEGER NOT NULL,                 -- counts toward the new-per-day limit
  before_state TEXT NOT NULL                -- JSON of the card before the review, for the optimizer later
);
CREATE INDEX melete_reviews_question ON melete_reviews ( question_id, reviewed_at );
CREATE INDEX melete_reviews_day ON melete_reviews ( reviewed_at );

CREATE TABLE melete_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                       -- generate | grade
  note_id TEXT,
  question_id TEXT,
  model TEXT NOT NULL,
  prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  outcome TEXT NOT NULL,                    -- succeeded | failed
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX melete_runs_note ON melete_runs ( note_id, id );

ALTER TABLE prompt_profiles ADD COLUMN last_folder TEXT;
```
Then, in code: insert the **Study** summary profile (`purpose 'summary'`, `seed_key 'study'`, name "Study") unless a profile with seed key `study` exists, and the two Melete profiles (`purpose 'melete_questions'` / `'melete_grading'`, seed keys of the same names, names "Melete questions" / "Melete grading"), each with version 1 (`source 'seed'`, the defaults in §6.1 and §9.1). A user profile already named "Study" keeps its name; the seeded one is then named "Study (seeded)". Settings keys aren't seeded (defaults in §9.2).

Tested from version 8 (with two summary profiles, the linker profile and a review job) and from empty.

### 3.2 Repositories (synchronous free functions on `getDatabase()`)
- `meleteSubjects.repository.ts`: `upsertSubject( folder )`, `listSubjects()`, `findSubject( id )`, `updateSubject( id, changes )`.
- `meleteNotes.repository.ts`: `insertNote`, `findNote( id )`, `listNotesBySubject( subjectId )`, `listNotesUnder( folderPrefix )` (including missing), `updateNote( id, changes )`, `findMissingByHash( hash )`, `setEnrolled( ids, enrolled, at )`, `claimNextQueued()` (the oldest `queued` by `enrolled_at`, set to `generating` in one statement), `requeueGenerating()` (restart recovery).
- `meleteQuestions.repository.ts`: `insertQuestions( noteId, runId, bodyHash, questions )`, `listForNote( noteId )`, `findQuestion( id )`, `setState( ids, state )`, `retireActiveForNote( noteId )`, `saveCard( id, card )`, `listDue( { subjectIds, now } )`, `listNew( { subjectId, limit } )`, `listLearningSoon( { subjectIds, until } )`, `countBySubject( now )`.
- `meleteReviews.repository.ts`: `insertReview`, `countNewReviewedSince( subjectId, since )`.
- `meleteRuns.repository.ts`: `insertRun`, `findRun( id )`.
- `promptProfiles.repository.ts`: `setLastFolder( profileId, folder )`; rows carry `last_folder`; `listActiveProfiles( purpose )` already exists.
- Queries that feed reviews always join `melete_notes` and filter `enrolled = 1 AND missing_at IS NULL` and `melete_questions.state = 'active'`.
- `apps/server/CLAUDE.md` repositories line updated.

## 4. Scanning and note identity (ADR 0057)

### 4.1 `melete/scan.ts` (pure helpers) and `services/meleteScan.service.ts`
- `splitFrontMatter( text )`: when the file starts with `---\n` and has a closing `---` line, returns `{ frontMatter, body }`; otherwise `{ frontMatter: null, body: text }`. Lenient: malformed YAML is not an error.
- `noteTitle( frontMatter, path )`: front-matter `title` when it is a plain string, else the file stem. A tiny reader for that one key, no YAML dependency (the agent does the same for `title` and `tags`).
- `bodyHash( body )`: SHA-256 hex (`node:crypto`) of the body with CRLF → LF, trailing whitespace trimmed from every line, and leading and trailing blank lines removed.
- `walkSubject( root, folder )`: every `.md` file under the subject folder, recursively, skipping dot-folders (`.obsidian`, `.trash`, …), symlinks that resolve outside the vault, and non-Markdown files. Returns `{ path, mtimeMs, size }` relative to the vault. Capped at 5000 files per scan (more → a `ValidationError` naming the cap).
- `listSubjectFolders( root, learningRoot )`: the direct child folders of the learning root (dot-folders skipped). Notes directly in the learning root belong to no subject and are ignored.
- Paths go through the existing `resolveFolder` and `isInside` rules in `clients/vault.client.ts`; a learning root outside the vault or missing → `ValidationError`.

### 4.2 `scanLearningRoot()` (the service)
Runs on `GET /api/melete/today`, `GET /api/melete/subjects/:id` and `GET /api/melete/review/next` when the last scan is older than 30 seconds (an in-memory timestamp; `force` bypasses it, used after enroll actions). One scan at a time: a second caller awaits the running one. Steps, in one SQLite transaction after the file reads:
1. Upsert a `melete_subjects` row per subject folder.
2. For every file found: if a live note has this path and the same `mtime_ms` and `size`, skip it. Otherwise read it, split, hash, take the title.
   - **Known path, same hash:** update `mtime_ms`, `size`, `title`, `subject_id` (a file can't change subject without changing path, but `subject_id` is kept in step).
   - **Known path, new hash:** update hash, title, mtime, size. If enrolled: `retireActiveForNote`, `generation = 'queued'`, `generation_error = null`. If not enrolled: nothing more (its questions are already out of reviews; they're `stale` and regenerated when enrolled, §4.3).
   - **New path, hash matches exactly one note that is missing or whose old path wasn't seen in this scan:** a **move**. Update that row's `path`, `subject_id`, `title`, mtime, size, clear `missing_at`. Questions and history follow.
   - **New path, otherwise:** insert a note (`enrolled` = the subject's `auto_enroll`; `generation = 'queued'` when enrolled).
   - **Two or more candidates with the same hash:** no move; insert as new (§ADR 0057, duplicates).
3. Every live note under the learning root whose path wasn't seen: set `missing_at = now`. Its questions stay `active` but drop out of reviews by the join. A missing note whose path or body reappears comes back by step 2.
4. Record the scan time.
Notes outside the learning root (a learning root changed in Settings) keep their rows and are hidden by the `listNotesUnder` filter; changing the root back restores them.

### 4.3 Enrollment (`services/melete.service.ts`)
- `setNoteEnrolled( id, enrolled )`: enrolling sets `enrolled_at = now` and queues generation when the note has no active questions made from its current hash (`generation = 'queued'`; active questions from an older hash are retired first). Unenrolling only flips `enrolled`; questions and cards are kept.
- `setSubjectEnrolled( subjectId, enrolled )`: the same for every live note of the subject, in one transaction, after a forced scan.
- `regenerateNote( id )`: retires active questions and queues generation (409 when not enrolled or already `queued` / `generating`).
- `retryGeneration( id )`: from `failed` only, to `queued`.
- `dropQuestion( id )`: `active` → `dropped` (409 otherwise).

## 5. Scheduling (ADR 0056)

### 5.1 `melete/scheduler.ts`
- One `FSRS` instance from `ts-fsrs`: `fsrs( generatorParameters( { request_retention: config.melete.requestRetention, enable_fuzz: true, enable_short_term: true } ) )`, default learning steps (1 m, 10 m) and relearning steps.
- `newCard( now )` → `createEmptyCard( now )`.
- `nextCard( card, rating, now )` → `scheduler.next( card, now, toFsrsRating( rating ) ).card`.
- `toRow( card )` / `fromRow( row )` map between `Card` and the question's columns (§3.1). `elapsed_days` is deprecated in ts-fsrs 5 and isn't stored; `fromRow` fills it with 0 and lets the library recompute from `last_review`. The task checks this against the library's behaviour.
- Tests inject a scheduler built with `enable_fuzz: false` so intervals are exact; one test checks the app's scheduler has fuzz on.

### 5.2 Card lifecycle
- New questions are inserted with `fsrs_state 'new'` and `due` null. A new question gets `due = now` the moment it is first served (§7.1), so the card's age starts then, not at generation.
- `recordReview` (§7.4) calls `nextCard` and saves every field in one transaction with the `melete_reviews` row.

### 5.3 Days (`melete/day.ts`)
- `dayStart( now )`: the most recent `MELETE_DAY_START_HOUR`:00 in `APP_TIME_ZONE` at or before `now`, computed with `Intl.DateTimeFormat` parts (as `backupName` does). Used only for the new-per-day count and the Today labels. A question is due when `due <= now`.

## 6. Claude calls (ADR 0055)

### 6.1 Prompts (`melete/prompts.ts`)
- `LOCKED_INSTRUCTIONS_MELETE_QUESTIONS`: you write active-recall questions from one study note; each question tests one idea from the note (definitions, how and why, steps, comparisons, common mistakes); answerable from the note alone; no questions about the note itself (its title, links, dates, formatting); the answer is complete but short; the passage is copied verbatim from the note, the shortest span that supports the answer; one question per distinct idea, at most 10; respond in the output format. The editable guidance is appended under `## Guidance`.
- `LOCKED_INSTRUCTIONS_MELETE_GRADING`: you grade a learner's answer against a reference answer and passage; judge meaning, not wording; `right` and `missed` are short bullets about content; `feedback` is one or two sentences addressed to the learner; suggest `again` for wrong or empty, `hard` for partly right or right with a significant gap, `good` for right; never suggest `easy`; respond in the output format.
- `DEFAULT_MELETE_QUESTIONS_GUIDANCE`:
  > Prefer questions that make me explain or apply an idea over questions that only ask me to name it. Mix question types: what is it, why does it matter, how does it work, when would I use it, what goes wrong. Keep each question to one sentence. If the note lists steps, ask for the steps in order. If the note contrasts two things, ask for the difference.
- `DEFAULT_MELETE_GRADING_GUIDANCE`:
  > Be strict about the core idea and relaxed about wording and order. If I got the gist but missed a detail that matters in practice, say which detail. Keep feedback short and specific; don't repeat my answer back to me.
- `buildMeleteSystemPrompt( locked, guidance )`.

### 6.2 Inputs
- **Generation** user message: `Subject: <name>`, `Title: <title>`, then the body (front-matter removed). A body over 60_000 characters fails the run before any call: "Note is too long for question generation (N characters, limit 60000). Split it into smaller notes."
- **Grading** user message: `Question`, `Reference answer`, `Passage` (omitted when empty), `Learner's answer`, each under its own heading.

### 6.3 `clients/claude.client.ts` additions
Following `summarizeSource` exactly (one `Anthropic` client per call, `maxRetries: 1`, `messages.parse`, `zodOutputFormat`, `stop_reason` checks for `max_tokens` and `refusal`, usage on every outcome, `Anthropic.APIError` wrapped):
- `generateQuestions( { model, system, user } )`: `max_tokens` 4096, `output_config: { effort: 'medium', format: zodOutputFormat( MeleteQuestionsOutput ) }`, timeout `MELETE_GENERATION_TIMEOUT_MS`. Throws `MeleteError` with usage when it can't produce valid output.
- `gradeAnswer( { model, system, user } )`: `max_tokens` 1024, `effort: 'low'`, timeout `MELETE_GRADING_TIMEOUT_MS`, `maxRetries: 0` (a retry doubles the wait on the phone).
- `MeleteError` in `errors.ts` (not an HTTP error; services turn it into a stored failure or a `failed` response).
- If `effort` isn't accepted by a model the task tests against (the summarizer already passes it to the same model list), stop and ask.

### 6.4 Post-processing (`melete/questions.ts`)
- Trim every field; drop questions with an empty prompt or answer; keep the first 10.
- Passage check: normalise whitespace in passage and body; if the passage isn't a substring of the body, set it to `''`.
- Positions are 1..n in output order.

### 6.5 Runs and cost
Every attempt writes a `melete_runs` row: model, the prompt version used, tokens (null when the call never happened), `estimateCostUsd( model, input, output )`, outcome, error. Generation runs carry `note_id`; grading runs carry `question_id`.

## 7. Services and the generator loop

### 7.1 Review queue (`services/meleteReview.service.ts`)
`getNextReview( { subjectId?, now } )` after a scan (30-second rule):
1. Subjects in scope: one, or all.
2. **Due:** active questions in enrolled, live notes with `due <= now`, ordered by `fsrs_state` (`learning`, `relearning` first), then `due`. Return the first.
3. **New:** for each subject in scope, `remaining = new_per_day − countNewReviewedSince( subject, dayStart( now ) )` (never below 0). Take new questions (`fsrs_state 'new'`, `due` null) from subjects with `remaining > 0`, ordered by note `enrolled_at`, then note path, then position. Return the first, setting its `due = now`.
4. **Learning soon:** if nothing yet, a `learning` or `relearning` question due within 20 minutes (Anki's learn-ahead limit), so an **Again** comes back in the same session.
5. Otherwise `item: null`.
Counts: `due` (step 2's count), `new_remaining` (sum of `min( remaining, available )`), `learning_soon`.

### 7.2 Today (`getToday( now )`)
Scan, then per subject: note counts, `due_count`, `new_available`, `new_remaining_today`, plus totals. Subjects ordered by name. `learning_root: null` when unset (the page shows the setup state).

### 7.3 Grading (`gradeAnswer( questionId, body )`)
- 404 unknown question; 409 when it isn't active in an enrolled, live note.
- **Blank:** an answer that is empty after trimming, or matches `/^(i\s*don'?t\s*know|idk|no\s*idea|pass|\?+)\.?$/i`, returns `{ outcome: 'skipped', reason: 'blank' }` with no call.
- Otherwise call `gradeAnswer` with the grading model and the current grading prompt version, record the run, return `graded` or `failed` (always HTTP 200; the UI falls back to self-rating on `failed`).

### 7.4 Recording a review (`recordReview( questionId, body, now )`)
- Same 404 / 409 checks. `grade_run_id`, when given, must be a grading run for this question (400 otherwise).
- In one transaction: read the card, `nextCard`, save it, insert `melete_reviews` (`was_new` when the card was `new` before), and return the question and fresh counts.
- `melete_review_mode` in settings is set to `body.mode` when it differs.

### 7.5 Generator loop (`worker/meleteGenerator.ts`, new)
- Started by `server.ts` with the worker and stopped by `shutdown.ts` before the store closes, the same shape as `startWorker` (poll every second, one at a time, a stop that awaits the running pass).
- A pass: `claimNextQueued()` → `generateForNote( noteId )` in `services/meleteGeneration.service.ts` → repeat until none.
- `generateForNote`: read the file now (the scan's read may be stale); if it's gone or its hash changed since it was queued, update the note via the scan rules and stop; else build the prompt, call `generateQuestions`, record the run, post-process, and in one transaction insert the questions (`body_hash` = the hash just read) and set `generation = 'idle'`. Any `MeleteError` or read error → `generation = 'failed'`, `generation_error` = the message.
- On start, `requeueGenerating()` moves `generating` notes back to `queued`.
- Logs carry `{ melete_note_id }` through `withLogContext`. No note text in logs.
- The job worker and the generator run independently; each makes at most one Claude call at a time.

## 8. Study profile and folder memory (ADR 0059)
- `SEEDED_PROFILES` gains Study (`seedKey 'study'`), guidance:
  > Summarize this for someone learning the subject, so the note can be studied and quizzed on later. Lead with the key concepts, each with a plain definition. Explain how things work and why, not just what. Capture any steps or procedures in order, with what each step is for. Keep the examples that make an idea click. Call out common mistakes, misconceptions and limits. Leave out anecdotes, sponsor segments, calls to action and anything about the presenter. Use precise terms and define jargon the first time it appears.
- Migration 9 seeds it for existing databases (§3.1); a fresh database gets it through the existing seeding.
- **Folder memory:** `saveJob` resolves the folder as `job.target_folder ?? defaultFolderFor( job )`, writes the note, then `setLastFolder( job.prompt_profile_id, folder )` when the job has a profile. Write first, then remember: a failed write remembers nothing.
- `defaultFolderFor( job )`: the profile's `last_folder` when it is set and the folder exists in the vault (`stat` through `resolveFolder`), else `config.defaultNoteFolder`. Computed only when assembling jobs in `ready_for_review` (other statuses use `config.defaultNoteFolder`), so polling stays cheap.
- `Job.default_folder` carries it. `NoteDestination` and `FilenamePreview` use `job.default_folder` instead of `useFolders().defaultFolder`; the folder tree still comes from `useFolders`.
- A deleted profile's `last_folder` goes with it; the existing default applies.

## 9. Settings and prompts

### 9.1 Prompt profiles
- `GET /api/prompt-profiles` lists summary profiles, the linker profile and the two Melete profiles with their `purpose` (the Prompts tab groups by it). `POST` still creates summary profiles only.
- Rename and delete on a Melete profile → 409 "The Melete prompts can't be renamed or deleted" (as for the linker). Versions, save, restore and reset work unchanged; reset restores the §6.1 defaults by seed key.
- Choosing a Melete or linker profile as a summary profile anywhere → 400 (extending the existing check).
- `resolveMeletePrompt( purpose )` returns the current version.

### 9.2 Settings service
- `melete_learning_root`: stored value, else null. Setting it validates with `parseFolderPath` and `resolveFolder` (must exist; 400 "Folder doesn't exist in the vault" otherwise) and resets the scan timestamp.
- `melete_question_model` and `melete_grading_model`: stored value, else the same Haiku fallback rule as `linking_model`.
- `melete_review_mode`: stored value, else `typed`.
- Profile ids: the seeded Melete profiles.
- `getLockedInstructions()` adds `melete_questions` and `melete_grading`.

### 9.3 Config (`config.ts`)
`config.melete = { requestRetention, dayStartHour, gradingTimeoutMs, generationTimeoutMs }`, `config.timeZone` (`APP_TIME_ZONE`, validated with `Intl.DateTimeFormat`), `config.obsidianVaultName` (`OBSIDIAN_VAULT_NAME`, optional, non-empty when set). `MELETE_REQUEST_RETENTION` must be in (0.7, 0.99]; `MELETE_DAY_START_HOUR` 0–23. `.env.example` (root and server) lists them with defaults. `backupName` keeps its own Singapore time zone (not in scope).

## 10. Routes (`routes/melete.routes.ts`, `controllers/melete.controller.ts`)
| Method and path | Body | Response |
| --- | --- | --- |
| `GET /api/melete/today` | | `GetMeleteTodayResponse` |
| `GET /api/melete/subjects/:id` | | `GetMeleteSubjectResponse` |
| `PATCH /api/melete/subjects/:id` | `UpdateMeleteSubjectBody` | `{ subject }` |
| `POST /api/melete/subjects/:id/enrollment` | `EnrollSubjectBody` | `GetMeleteSubjectResponse` |
| `GET /api/melete/notes/:id` | | `GetMeleteNoteResponse` |
| `PATCH /api/melete/notes/:id` | `UpdateMeleteNoteBody` | `GetMeleteNoteResponse` |
| `POST /api/melete/notes/:id/regenerate` | | `GetMeleteNoteResponse` (202) |
| `POST /api/melete/notes/:id/retry` | | `GetMeleteNoteResponse` (202) |
| `POST /api/melete/questions/:id/drop` | | `{ question }` |
| `GET /api/melete/review/next?subject=:id` | | `GetNextReviewResponse` |
| `POST /api/melete/questions/:id/grade` | `GradeAnswerBody` | `GradeAnswerResponse` |
| `POST /api/melete/questions/:id/review` | `RecordReviewBody` | `RecordReviewResponse` |

Ids validated as uuids (400). `GET` endpoints that scan answer 409 "Choose a learning root first" when it's unset (except `today`, which returns `learning_root: null`). Errors through the existing typed errors. All routes go through the four layers. `obsidian_url` is `obsidian://open?vault=<encoded name>&file=<encoded path without .md>` or null.

## 11. Web

### 11.1 Routes, drawer and data
- `routes.tsx`: `melete` (Today), `melete/subjects/:subjectId`, `melete/notes/:noteId`, `melete/review` (reads `?subject=`). The `*` fallback is unchanged.
- `NavDrawer`: **Melete** after Transcriber, icon `SchoolOutlined` (or another `@mui/icons-material` icon; no new dependency), current on `/melete/*`.
- `api/melete.api.ts`; `meleteKeys` in `queryKeys.ts`; hooks `useMeleteToday`, `useMeleteSubject`, `useMeleteNote`, `useNextReview`, `useEnrollSubject`, `useSetNoteEnrolled`, `useUpdateSubject`, `useRegenerateNote`, `useRetryGeneration`, `useDropQuestion`, `useGradeAnswer`, `useRecordReview`. Mutations update caches from responses, as elsewhere.
- `useMeleteSubject` and `useMeleteNote` poll every 2 seconds while any note shows `queued` or `generating`, and stop otherwise.

### 11.2 Pages (`components/Melete*`)
- **`MeleteToday`:** with no learning root, `LearningRootSetup` (an explanation and the existing `FolderPicker` in a dialog, saving `melete_learning_root`). Otherwise totals ("12 due · 5 new"), **Start review** (all subjects), and a list of subjects (name, due, new remaining, enrolled/total) linking to the subject page, each with its own **Review** action. An empty learning root says how to add subject folders. A small settings action reopens the learning-root dialog.
- **`MeleteSubject`:** subject name and counts; **Enroll all** / **Unenroll all**; an **Auto-enroll new notes** switch; **New questions per day** (number field, 0–100, saved on blur); the note list: title, path below it, enrolled switch, status (`Generating…`, `N questions`, `Failed` with **Retry**, `Missing`, `Changed — regenerating`), linking to the note page.
- **`MeleteNote`:** title, **Open in Obsidian** (when the URL is set), **Regenerate**, the question list (prompt, answer, passage in a quote block, due and reps, **Drop**; dropped questions greyed under a "Dropped" heading).
- **`MeleteReview`:** §11.3.

### 11.3 Review screen (phone-first)
- One column, max width 40rem, centred. Header: subject name, progress ("3 done · 9 left", from counts), close (back to Today).
- **Typed mode:** question text, a multiline `TextField` (autofocus on desktop only, so the phone keyboard doesn't jump up on load), **Check** (submits `grade`). While grading, the button shows progress; the answer stays visible.
  - `graded`: `GradeFeedback` with the verdict chip, **Right** and **Missed** lists, the feedback line, the reference answer, the passage (collapsible) and **Open in Obsidian**. The rating bar pre-selects the suggestion.
  - `skipped` (blank): the reference answer and passage; **Again** pre-selected.
  - `failed`: an info `Alert` ("Couldn't grade this one; rate it yourself") and the reference answer; no pre-selection.
- **Quick mode:** the question and **Show answer**; then the reference answer, passage and the rating bar.
- **Rating bar** (`RatingBar`): four buttons, Again, Hard, Good, Easy, equal width, at least 48px tall, `position: sticky; bottom: 0` with `padding-bottom: env( safe-area-inset-bottom )`. A pre-selected rating is shown as selected and confirmed with **Next** (or by tapping it again); tapping another rating selects it. Keyboard on desktop: 1–4 select, Enter confirms.
- A mode toggle (`ToggleButtonGroup`: Typed / Quick) in the header; changing it applies from the next question and is sent with the next review.
- **Drop question** in an overflow menu; dropping skips to the next item.
- `item: null`: "All done for now", with the next due time when known, and a link back to Today.
- The page uses `useNextReview` only on mount and after each recorded review (no polling).

### 11.4 Settings
- **Prompts tab:** the list groups by `purpose`: Summary profiles, Linking, **Melete** (Melete questions, Melete grading). `PromptPanel` already handles a non-summary profile (the linker); the Melete profiles reuse that path, with locked instructions from `locked_instructions.melete_questions` / `.melete_grading`.
- **Models tab:** a **Melete** section with **Question model** and **Grading model** selects (the same `useModels` list).
- The learning root is not in Settings (§11.2).

### 11.5 Installable app (ADR 0060)
- `apps/web/public/manifest.webmanifest`: `name` "Mnemosyne", `short_name` "Mnemosyne", `start_url` "/melete", `scope` "/", `display` "standalone", `background_color` and `theme_color` from the light theme's background and primary, `icons`: `icons/icon-192.png`, `icons/icon-512.png` (`purpose: "any"`), `icons/icon-maskable-512.png` (`purpose: "maskable"`).
- `apps/web/public/icons/`: the three PNGs, `apple-touch-icon-180.png`, `favicon.svg` and `icon.svg` (the source). Supplied with these docs; Naresh may replace them.
- `index.html`: `<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<link rel="icon" type="image/svg+xml">`, `<meta name="theme-color">` (light and dark with `media`), `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="Mnemosyne">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, and `viewport-fit=cover` added to the viewport meta.
- `web.routes.ts` already serves `public/` through the build; a test checks `/manifest.webmanifest` is served with `application/manifest+json` (set the type explicitly in the static options if `express.static` doesn't).
- A unit test reads the manifest: required fields present, `start_url` is a route in `routes.tsx`, every icon file exists with the size its name says (PNG header width and height).

## 12. Docker and phone access
- `docker-compose.yml`: `mnemosyne.ports` → `"127.0.0.1:3100:3100"`. The e2e override already replaces the ports (`!override`), so it is unaffected; the task checks.
- `docs/phone-access.md` (new): install Tailscale on the Mac and phone and sign in to the same tailnet; enable HTTPS certificates and MagicDNS in the admin console; `tailscale serve --bg 3100`; the resulting `https://<machine>.<tailnet>.ts.net` address; machine names appear in public Certificate Transparency logs, so rename the machine first if its name reveals anything; never `tailscale funnel`; keep the Mac awake on power (System Settings → Battery → Options → "Prevent automatic sleeping on power adapter when the display is off"); Gmail is connected from the Mac at `localhost`; add to Home Screen in Safari (Share → Add to Home Screen) and Chrome; `tailscale serve status` and `tailscale serve reset` to check and undo; what to do when the phone can't reach it (Mac asleep, Tailscale off, container down). The task checks every command and menu name against Tailscale's current docs (Context7 or the web) and notes the date checked.
- README links the guide.

## 13. Tests

### 13.1 Rules
- No test touches the network, the Claude API or a real vault. Melete tests use a temporary vault folder built from `test-support/meleteVault.fixture.ts` (two subjects, nested folders, notes with and without front-matter, a `.obsidian/` folder, a non-Markdown file, a symlink pointing outside) and mock `clients/claude.client.js`.
- Scheduling tests use the no-fuzz scheduler and fixed clocks.
- Existing tests pass unchanged, except where a contract gains fields (`Job.default_folder`, `Settings`, `GetSettingsResponse.locked_instructions`, `PromptProfile.purpose`) or a test lists every migration, every prompt profile or every drawer item; list each in the log line.
- Scan tests: first scan; unchanged files skipped by mtime/size; edit of an enrolled note (retire, queue) and of an unenrolled note (stale only); move within a subject, across subjects and of a whole subject folder; delete then restore by path and by content; duplicates; front-matter-only change; auto-enroll; learning root changed and changed back; the 5000 cap; symlink outside ignored.
- Queue tests: due before new; learning before review; new-per-day across the day boundary at 04:00 Singapore time (and with `MELETE_DAY_START_HOUR` 0); unenrolled, missing, dropped and retired excluded; learning-soon fallback; per-subject scope.

### 13.2 Browser tests (`test:browser`, Chromium and WebKit)
`MeleteReview.browser.test.tsx` at 390×844 and 1280×800: no horizontal scroll, the rating bar visible and inside the viewport with the on-screen content scrolled, each rating button at least 44px tall, light and dark.

### 13.3 End-to-end (ADR 0053)
- The fakes' `/v1/messages` tells requests apart by the first line of the system prompt (the locked instructions): summary (as now), Melete questions (two questions whose passages are in the fixture note), Melete grading (a `partial` grade suggesting `hard`). Unknown → 400, as now. Fakes unit tests updated.
- `run.sh` seeds the temp vault with `Learning/E2E/Recall.md`.
- `melete.spec.ts` with Playwright's **Pixel 7** device (Chromium, so no WebKit install in e2e): set the learning root to `Learning`, open subject E2E, **Enroll all**, wait for "2 questions", **Start review**, type an answer, **Check**, see "Missed", the Hard rating pre-selected, **Next**, then **Show answer** in Quick mode, **Good**, and "All done for now". Then `GET /manifest.webmanifest` returns 200 with `start_url` "/melete".

## 14. Phases and checkpoints
See `tasks.md`.
