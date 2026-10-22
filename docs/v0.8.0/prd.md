# Mnemosyne v0.8.0 — Product Requirements

## 1. Summary
v0.8.0 adds **Melete**, Mnemosyne's second module: a tutor named after the Muse of practice, sister of Mneme (memory). Naresh keeps one vault folder per subject under a learning root. Melete turns the notes he enrolls into stored quiz questions, schedules each question with spaced repetition, and quizzes him on what's due each day. He types his answers and Claude grades them against the note, or he rates himself in a quicker flashcard mode. A new **Study** prompt profile makes video and article summaries suitable for learning. The folder picker remembers the last folder used with each profile. Melete's pages are built for phone use, so Naresh can review away from his desk over Tailscale.

## 2. Background
Through 0.7.x, Mnemosyne is an ingest pipeline: videos, articles, feeds and newsletters become summarized, linked notes in the vault. Nothing helps Naresh remember what's in them. He is midway through a course and wants the material to stick across its modules.

Active recall (answering a question from memory) and spaced repetition (reviewing just before you'd forget) are the two best-supported study techniques. Both need the same questions to come back on a schedule, so the questions have to be stored and tracked, not made fresh each session.

Course material arrives in three ways: YouTube videos he finds on a topic, articles, and notes he writes himself in Obsidian. The first two already go through Mnemosyne. The existing prompt profiles (business, coding) pull out takeaways and ideas, not the definitions, steps and pitfalls a quiz needs.

The 0.3.1 app shell was built for more than one module, and Melete is the first to use it. Mnemosyne stays the ingest pipeline; Melete is its own module that only reads the vault. Knowledge modules share the vault and each module owns its data; no ADR records this yet, so ADR 0054 records it.

## 3. Goals
- Naresh can study a subject from whatever notes are in its folder, whatever made them.
- Each enrolled note becomes a set of good questions once, and those questions come back on a spaced-repetition schedule.
- A daily review takes minutes and tells him what he got wrong, pointing to the part of the note he missed.
- Videos and articles summarized for study produce notes worth quizzing on.
- Working through a subject doesn't mean picking the same folder for every note.
- He can review from his phone.

## 4. Non-goals
- **Melete never writes to the vault.** No edits, no notes, no front-matter changes. Its data lives in the app's database.
- **No automatic enrollment.** A note is studied only when Naresh enrolls it or its subject.
- No questions written by Naresh by hand, and no import from Anki or other tools.
- No offline review. Grading needs the server, so the phone needs the Mac reachable.
- No phone-friendly versions of other pages (review queue, editor, Settings). They work on a phone but aren't designed for it.
- No public internet access and no login. The app stays reachable only on Naresh's own devices (Tailscale Funnel stays off).
- No AI-chosen daily topics, explanations or chat beyond grading feedback. The Today view is driven by the schedule.
- No change to summarizing, linking, reviewing or saving notes, except the Study profile and the folder picker default.
- No cloud hosting. Moving off the Mac is a later increment (§7 keeps it possible).

## 5. User flow
1. **Set up once.** In Settings, Naresh sets the **learning root** (e.g. `Learning/`). Each folder directly under it is a subject. He makes subject folders in Obsidian or in the folder picker.
2. **Add material.** He submits a YouTube video or article and picks the **Study** profile. In review, the folder picker defaults to the folder he last used with Study, so a run of videos on one subject lands in its folder without re-picking. He also writes his own notes straight into subject folders in Obsidian.
3. **Enroll.** He opens **Melete** from the drawer and picks a subject. It lists the subject's notes, each marked enrolled or not. He enrolls single notes, or **Enroll all** for the whole subject.
4. **Questions are made.** Enrolling queues question generation for each note. The note shows **Generating** and then how many questions it has. A failed note shows the error and **Retry**.
5. **Review.** Melete's home shows **Today**: how many questions are due, by subject. **Start review** goes through them one at a time.
   - **Typed (default):** he types his answer and submits. Claude grades it against the note, says what was right and what was missed, shows the reference answer and a link to the source note, and suggests a rating (**Again**, **Hard**, **Good**, **Easy**). He accepts it or picks another.
   - **Quick:** he thinks of the answer, taps **Show answer**, and rates himself.
   The rating sets when the question comes back.
6. **Weed.** A poor question can be **dropped** during review or from the note's question list. It never comes back.
7. **Notes change.** If he edits an enrolled note, Melete notices, retires that note's old questions and makes new ones.
8. **On the phone.** With Tailscale on his Mac and phone, he opens Mnemosyne's private HTTPS address, adds it to his home screen, and reviews in Melete.

## 6. Features

### 6.1 Subjects
- [ ] Settings has a **learning root** setting: one vault folder, chosen with the existing folder picker. Until it's set, Melete's home page explains how to set it.
- [ ] Each folder directly under the learning root is a subject, named after the folder. Creating or deleting a folder in Obsidian adds or removes the subject; nothing is registered by hand.
- [ ] A subject's notes are every Markdown note in its folder, including subfolders. Obsidian's own folders and non-Markdown files are ignored, as in the agent service.
- [ ] Any note counts, with or without Mnemosyne front-matter.
- [ ] If a subject folder is renamed or removed, its notes' questions and history are kept but hidden until a folder with that path exists again. Moving a note between subjects keeps its questions (ADR-level detail in the TRD).

### 6.2 Enrollment
As Naresh, I want to choose what I study.
- [ ] Each note in a subject is either enrolled or not. Nothing is enrolled by default.
- [ ] **Enroll** and **Unenroll** per note; **Enroll all** and **Unenroll all** per subject.
- [ ] A subject can be set to **enroll new notes automatically**, so notes added later join without a click. Off by default.
- [ ] Unenrolling hides the note's questions from reviews but keeps their history. Enrolling again brings them back on their old schedule.

### 6.3 Question bank
- [ ] Enrolling a note queues question generation. Claude reads the note and writes a handful of questions, scaled to how much the note covers (roughly 3–10).
- [ ] Each question has a prompt, a reference answer and the passage of the note it's based on.
- [ ] Questions test understanding and recall of the note's content: definitions, how and why, steps, comparisons, common mistakes. No trivia about the note itself (dates, links, its title).
- [ ] Questions are stored and reused. Generation runs once per note version, not per review.
- [ ] When an enrolled note's content changes, its existing questions are retired (history kept) and a new set is generated. Changes to front-matter alone don't count.
- [ ] A deleted note's questions stop appearing in reviews, with their history kept; if the note comes back, so do they.
- [ ] Generation failures are shown per note with **Retry**, and never affect other notes.
- [ ] Each note's question list can be viewed, with **Drop** per question and **Regenerate** for the note.
- [ ] Every generation run records its model, prompt version, tokens and estimated cost, like summaries.

### 6.4 Scheduling
- [ ] Every active question has its own spaced-repetition schedule: when it's next due and how well it's known.
- [ ] Ratings are **Again**, **Hard**, **Good** and **Easy**. Again brings the question back in the same session; the others push it out by increasing intervals.
- [ ] New questions enter the schedule gradually: a per-subject **new questions per day** limit (default 10) stops a large enrollment from flooding one day.
- [ ] Dropped and retired questions are never scheduled.
- [ ] The algorithm (FSRS or SM-2) is a TRD decision.

### 6.5 Review
As Naresh, I want a short daily review that tells me what I got wrong.
- [ ] **Today** shows due and new question counts per subject, and **Start review** for all subjects or one.
- [ ] A review shows one question at a time with the subject and a progress count.
- [ ] **Typed mode (default):** a text box for the answer. Claude grades it against the reference answer and the note passage, and returns: what was right, what was missed or wrong, a suggested rating, and the reference answer. A link opens the source note in Obsidian.
- [ ] The suggested rating is pre-selected; Naresh can pick another before moving on. Only his final choice is recorded.
- [ ] **Quick mode:** **Show answer** reveals the reference answer and passage; he picks a rating. No Claude call.
- [ ] He can switch modes at any time; the last mode used is remembered.
- [ ] Grading failures don't block a review: the reference answer is shown and he rates himself.
- [ ] Every answer is recorded with its mode, rating and time, and every grading call with its model, tokens and estimated cost.
- [ ] A review can be left at any point; progress up to the last rated question is kept.

### 6.6 Study prompt profile
- [ ] A new **Study** summary prompt profile is seeded alongside the existing ones, editable and versioned like them.
- [ ] It summarizes for learning: key concepts and definitions, how things work, steps or procedures, examples, and common mistakes or misconceptions.
- [ ] It works with the existing locked instructions, so the note's shape (front-matter, title, sections, tags) and linking are unchanged.

### 6.7 Folder picker remembers per profile
- [ ] When a note is saved, the folder it was saved to is remembered for the prompt profile its summary used.
- [ ] In review, the folder picker defaults to the folder last used with the job's profile. With no history for that profile, it defaults to the existing default folder, as before.
- [ ] Picking a folder still applies to that note only until it's saved.

### 6.8 Melete settings
- [ ] Settings gets Melete's options, placed in the existing tabs as the TRD decides:
  - the learning root;
  - a **question model** and a **grading model**, from the same model list, both defaulting to Haiku;
  - the **question prompt** and the **grading prompt**, editable and versioned like other prompts, with locked instructions shown read-only;
  - per-subject new questions per day and auto-enroll, which may live on the subject page instead.

### 6.9 Phone access
As Naresh, I want to review on my phone.
- [ ] Melete's pages are designed for phone width first and work on the desktop too: large tap targets, the answer box and rating buttons reachable with a thumb, no sideways scrolling.
- [ ] The app has a web app manifest and icons, so **Add to Home Screen** opens it full-screen with its own name and icon. No offline mode.
- [ ] A setup guide in `docs/` covers Tailscale on the Mac and phone, `tailscale serve` for a private HTTPS address, choosing a machine name that reveals nothing (it appears in public certificate logs), keeping Funnel off, and keeping the Mac awake on power.
- [ ] Gmail is still connected from the Mac; the guide says so.
- [ ] The app keeps working at `localhost` exactly as before.

## 7. Constraints
- Single user. Melete is a module in the same monorepo, web app and database, with its own tables; it reads the vault and never writes to it.
- Model, prompt version and usage for question generation and grading are stored in the app's database.
- No test touches the network or a real vault. Claude responses come from fixtures, and the vault in tests is a temporary folder of fixture notes.
- New dependencies only as named in the TRD.
- Keep Melete movable to a cloud host later: settings in `.env` or the database, data in SQLite, vault access through the existing vault path, nothing tied to the Mac or to Tailscale in code.
- Tailscale setup is documentation only; no Tailscale code or dependency in the app.

## 8. Out of scope (KIV)
- AI-suggested daily topics, explanations and follow-up chat in Melete.
- Questions from links between notes (across a subject's graph) and whole-subject mock tests.
- Writing study stats or due dates back into the vault.
- Offline review and push reminders on the phone.
- Phone-friendly review queue, editor and Settings.
- Cloud hosting (needs decisions on transcription, YouTube downloads, vault sync and login).
- Business-idea validator, job-alert intake (ADR 0041), wealth tracker.

## 9. Open questions
None at PRD level. The technical decisions are in `trd.md` and ADRs 0054–0060.

Decided while scoping:
- A tutor is the next module, called **Melete** everywhere (docs, UI and code); Mnemosyne stays the ingest pipeline.
- A learning root folder, with each subfolder a subject.
- Material comes from videos and articles (Study profile) and notes Naresh writes himself.
- Stored question bank per note, regenerated when the note changes, with a drop action.
- Spaced-repetition scheduling per question, and a Today view.
- Typed answers graded by Claude (Haiku default, selectable) with a suggested, overridable rating, plus a quick self-rated mode.
- Opt-in enrollment, per note or a whole subject at once.
- The folder picker remembers the last folder per prompt profile.
- Phone access through Tailscale: setup docs, phone-first Melete pages and a web app manifest.
