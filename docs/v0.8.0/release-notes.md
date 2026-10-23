# Mnemosyne v0.8.0 — Release notes
v0.8.0 adds **Melete**, a study module in the same app. It turns the notes in a vault folder into recall questions, schedules them with spaced repetition and quizzes you in the browser, with Claude grading typed answers. It also adds a **Study** summary profile, remembers the vault folder you last used with each prompt profile, and makes the app installable on a phone. The app port is now published on `127.0.0.1` only. Transcribing, summarizing, linking, reviewing and saving behave as in 0.7.1.

## New

### Melete
- **Learning root and subjects.** Choose a vault folder on the Melete page; each folder directly inside it is a subject. Melete scans on demand (when you open its pages, at most every 30 seconds), never writes to the vault and has no file watcher (ADRs 0054, 0057).
- **Enrolling.** Enroll a note, or a whole subject with **Enroll all**, or switch on **Auto-enroll new notes**. A generator loop beside the job worker asks Claude for up to 10 questions per note, each with an answer and the passage it came from. Edit an enrolled note and its questions are replaced; move or rename it and its questions and history follow (ADRs 0055, 0057, 0058).
- **Review.** FSRS scheduling at 90% target recall through `ts-fsrs` (ADR 0056). Due questions come first, then new ones up to **New questions per day** (default 10) for each subject. **Typed** mode has Claude mark your answer and suggest a rating; **Quick** mode is show-answer-then-rate. Ratings are Again, Hard, Good, Easy, with keys 1–4 and Enter on a keyboard. A blank answer skips grading, and a failed grading falls back to self-rating.
- **Pages.** Today (due and new, a list of subjects), a subject page, a note page (its questions, **Regenerate**, **Drop**, **Open in Obsidian**) and the review screen, built phone-first with a sticky rating bar (ADR 0060).
- **Settings.** Two Melete prompts in Settings → Prompts (questions and grading, versioned like the others) and a **Melete** section in Settings → Models for the question and grading models (Haiku by default).
- Every Claude call is recorded with its model, prompt version, tokens and estimated cost in `melete_runs`.

### Study profile and folder memory
- **Study** is a fourth seeded summary profile for notes you want to learn from. A profile you already have named "Study" keeps its name and the seeded one is named "Study (seeded)" (ADR 0059).
- The folder picker on the review screen starts on the folder you last saved a note to with the same prompt profile, while that folder still exists. A failed save remembers nothing.

### Installable app and phone access
- A web app manifest, icons and the iOS and Android meta tags, so **Add to Home Screen** gives an icon that opens Melete. No service worker: it needs the network (ADR 0060).
- [`docs/phone-access.md`](../phone-access.md) shows how to reach the app privately from a phone with Tailscale Serve, checked against Tailscale's docs on 2026-10-23.

## Changes
- **The app port is localhost-only.** `docker-compose.yml` publishes `127.0.0.1:3100:3100`, so other machines on your network can no longer reach it. To use it from a phone, follow the phone-access guide.
- **Migration 9** adds the `melete_subjects`, `melete_notes`, `melete_questions`, `melete_reviews` and `melete_runs` tables and `prompt_profiles.last_folder`, and seeds the Study profile and the two Melete prompts. It can't be undone: to go back to 0.7.1, restore a backup taken before the upgrade.
- **New optional variables** (both `.env.example` files): `OBSIDIAN_VAULT_NAME`, `APP_TIME_ZONE` (default `Asia/Singapore`), `MELETE_DAY_START_HOUR` (4), `MELETE_REQUEST_RETENTION` (0.9), `MELETE_GRADING_TIMEOUT_MS` (20000) and `MELETE_GENERATION_TIMEOUT_MS` (120000).
- **API.** New `/api/melete/*` endpoints (see the README). `GET /api/prompt-profiles` takes `?purpose=` and lists only summary profiles by default, so existing pickers are unchanged. Settings gains the `melete_*` keys and locked instructions; prompt profiles carry a `purpose`; jobs carry `default_folder`. The Melete prompts can't be renamed or deleted, or chosen as a summary profile.
- **Dockerfile** now copies `apps/web/public`, which earlier builds left out (the manifest and icons would have been missing from the image).
- New dependency: `ts-fsrs` (server). Nothing new in the web app, the agent or shared.

## Upgrading
1. **Back up your database first**, with 0.7.1 still running: open Settings → Sources and click **Back up now**, or copy it by hand as in the 0.7.1 notes. Migration 9 can't be undone.
2. Optional: add `OBSIDIAN_VAULT_NAME=<your vault's name in Obsidian>` to the `.env` at the repo root so **Open in Obsidian** links work. The other new variables have defaults.
3. Rebuild: `docker compose up -d --build`. On startup the database migrates from version 8 to version 9; jobs, feeds, sources, profiles and settings are untouched.
4. Open `http://localhost:3100` (the app no longer answers on your Mac's network address). Open **Melete**, choose a learning root and enroll a note.
5. For the phone, follow [`docs/phone-access.md`](../phone-access.md).
6. For development, `apps/server/.env` needs nothing new.

## Deferred
- A file watcher or background scan, and a service worker or offline review.
- Review statistics, the FSRS optimizer (each review already stores the card as it was before), and per-question editing.
- Everything on the roadmap in the README.

## Known issues
- **Question quality depends on the note.** Very short notes give few questions; very long ones (over 60,000 characters) are refused until split.
- **Hard and Good can come straight back.** A card still in learning steps that comes due within 20 minutes is shown again in the same session (ADR 0056).
- **Menu names on phones vary.** The Add to Home Screen steps and the macOS battery settings in the guide are written from knowledge, not from vendor docs, and are marked as such.
- Known from earlier versions: pages that need JavaScript or a login can't be read; the web bundle is large; costs are estimates from a price table.

## Under the hood
- Server: `melete/` (scan, scheduler, day, queue, questions, grading, prompts, obsidian, runs), the five Melete repositories, `meleteScan`, `melete`, `meleteGeneration` and `meleteReview` services, `worker/meleteGenerator.ts`, `claude.client.ts` `generateQuestions` and `gradeAnswer`, a non-creating `resolveExistingFolder` in the vault client.
- Web: `MeleteToday`, `MeleteSubject`, `MeleteNote`, `MeleteReview` and their parts, `RatingBar`, `melete.api.ts` and hooks, the Prompts and Models tab additions, `NoteDestination` on `job.default_folder`.
- Tests at release: 625 shared, 2520 server and 1485 web unit tests, 38 browser tests (Chromium and WebKit), 244 agent tests and 4 container tests, 16 e2e fakes tests and 5 e2e specs (one on a Pixel 7 profile for Melete), with lint, typecheck and builds clean.

## Decisions
New ADRs: [0054](../decisions/0054-modules-share-the-vault-own-their-data.md) modules share the vault and own their data · [0055](../decisions/0055-melete-in-express.md) Melete in Express · [0056](../decisions/0056-fsrs-scheduling.md) FSRS scheduling · [0057](../decisions/0057-note-identity-and-scans.md) note identity and scans · [0058](../decisions/0058-melete-data-and-generator-loop.md) Melete data and generator loop · [0059](../decisions/0059-study-profile-and-folder-memory.md) Study profile and folder memory · [0060](../decisions/0060-phone-access.md) phone access.
