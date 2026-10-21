# Mnemosyne v0.7.0 — Product Requirements

## 1. Summary
v0.7.0 adds **wikilinks**. After a note is summarized, an agent searches the Obsidian vault and proposes `[[links]]` from the new note to related notes and concepts. Naresh accepts or rejects each one on the review screen before saving. The agent runs in a new, stateless Python service, the **vault agent service**, which has read-only access to the vault. Linking is its first job; the AI tutor and the business-idea validator are expected to add endpoints to it later.

## 2. Background
Through 0.6.0, every note Mnemosyne writes is an island: videos, articles, feed items and newsletters each land as a standalone summary. Obsidian's value comes from links between notes: the graph, backlinks and finding ideas again by following them. Adding links by hand after each save is the step Naresh skips.

The vault is being wiped before this version ships, so 0.7.0 starts from an empty vault and grows its links from the first note. Starting now means the link structure is consistent from the beginning instead of being retrofitted onto hundreds of notes.

An agent that can search and read the vault is also what the tutor and the idea validator need. Building it as its own service now (instead of a tool loop inside Express) makes that groundwork reusable.

## 3. Goals
- Every new note arrives in review with proposed links to related existing notes and to concepts.
- Naresh stays in control: no link reaches the vault without his acceptance.
- Concept names stay consistent, so the vault doesn't fill up with near-duplicates like `[[Pricing]]` and `[[Pricing strategies]]`.
- Existing notes are never modified. Backlinks come from Obsidian, which shows a note's backlinks automatically.
- A reusable vault agent service with read-only vault tools, ready for later agents.

## 4. Non-goals
- **No writes to existing notes.** No backlinks inserted into old notes, no edits, renames or moves.
- **No stub or concept note files.** Concept links stay unresolved in Obsidian until Naresh creates the note himself.
- **No embeddings or vector index.** The agent searches with text tools; semantic search is KIV (§8).
- **No re-linking of the existing vault** and no bulk "link everything" action. The vault starts empty.
- No linking between notes that are both still in review. The agent only sees notes already saved in the vault.
- No change to the summary itself: its sections, prompt profiles and the summarizer model are untouched.
- No job-alert intake (still deferred, ADR 0041), no tutor and no idea validator.

## 5. User flow
1. Naresh submits a video or article, or summarizes an inbox item, as before.
2. After summarizing, the job shows **Linking**. The agent reads the vault and returns its suggestions, usually within seconds.
3. The review screen opens with the summary in the editor and a **Suggested links** panel beside it. Each suggestion shows the link target, its kind (**existing note**, **existing concept** or **new concept**), where it goes (inline, at a quoted phrase, or under **Related**) and a one-line reason.
4. Naresh accepts or rejects each one. Accepting inserts the link into the note in the editor straight away, and autosave stores it. Rejecting removes the suggestion.
5. If he edits the note so heavily that the suggestions no longer fit, **Re-run linking** asks the agent again on the current text.
6. He saves the note. Only accepted links are in the saved file. The next note's agent run can link to this one.
7. **Something goes wrong.** If the agent service is down or the run fails, the note still goes to review, with a message and a **Retry linking** action. Naresh can save without links.

## 6. Features

### 6.1 Vault agent service
- [ ] A new Python service runs beside the app in Docker Compose. It is stateless: it keeps no database, job state or files of its own. Each request carries everything it needs.
- [ ] The vault is mounted into it **read-only**. It can list, search and read notes but cannot write anything. The app remains the only writer to the vault.
- [ ] It is reachable only by the app (not exposed on a host port) and rejects requests without the shared secret.
- [ ] It ignores Obsidian's own folders (`.obsidian/`, `.trash/`) and anything that isn't a Markdown note.
- [ ] It reports health, and the app shows the agent service as unavailable (rather than failing jobs) when it isn't reachable.
- [ ] The request and response shapes are defined once, so the app and the service can't drift apart.
- [ ] The Anthropic API key for the agent lives in the service's environment, listed by name in `.env.example`.

### 6.2 Linking agent
As Naresh, I want each new note linked to what I already have, and to the concepts it's about.
- [ ] The agent receives the note's title, tags, body and target folder, the model to use and the linker prompt.
- [ ] It can list the vault's notes (title, folder, tags), search the vault's text, read a note, and list every link target already used in the vault (both real notes and unresolved concepts) with how often each is used.
- [ ] It returns **suggestions**, not a rewritten note. Each has a target, a kind (existing note, existing concept, new concept), an anchor phrase from the note's text or none, and a one-line reason.
- [ ] **Reuse before invent:** the agent links to an existing note or existing concept whenever one fits, and proposes a new concept only when none does.
- [ ] New concepts follow one naming rule: Title Case, singular, a short noun phrase (`[[Pricing Strategy]]`, not `[[pricing strategies]]`).
- [ ] At most 8 suggestions per run. No suggestion links a note to itself, and no target is suggested twice.
- [ ] An anchor phrase must appear verbatim in the note's text. A suggestion whose concept is relevant but not named in the text has no anchor and goes under **Related**.
- [ ] Suggestions never anchor inside the front-matter, headings, existing links, timestamps or quotations, so the note's structure is never broken.
- [ ] With an empty vault, the agent still proposes concept links, so the first notes start building the graph.
- [ ] Every run records its model, prompt version, tokens and estimated cost, and they count towards the job's existing cost display.

### 6.3 Job flow
- [ ] The job flow becomes queued → … → summarizing → **linking** → ready for review.
- [ ] Linking failure is non-fatal. The job goes to ready for review with no suggestions and the reason, and **Retry linking** runs the agent again. It never blocks saving.
- [ ] Regenerating the summary discards its pending suggestions and runs linking again on the new summary.
- [ ] Linking a job doesn't hold up the worker for other jobs longer than summarizing would.

### 6.4 Review: suggested links
As Naresh, I want to approve each link before it reaches my vault.
- [ ] The review screen shows a **Suggested links** panel next to the editor, listing each pending suggestion with its target, kind, placement (the anchor phrase or **Related**) and reason. Kinds are visually distinct, so a new concept that is a near-duplicate of an existing one is easy to spot.
- [ ] **Accept** inserts the link into the note in the editor:
  - with an anchor: the first occurrence of the phrase becomes `[[Target|phrase]]` (or `[[Target]]` when they're the same);
  - without an anchor: the link is added as a bullet in a `## Related` section at the end of the note, created if missing.
  The change is autosaved like any edit.
- [ ] **Reject** removes the suggestion. **Accept all** and **Reject all** act on every pending suggestion.
- [ ] If the anchor phrase no longer appears in the note (Naresh edited it), the suggestion is marked **stale**. It can't be inserted inline but can still be accepted into **Related**.
- [ ] **Re-run linking** replaces the pending suggestions with a new run on the current note text. Links already accepted stay in the note.
- [ ] Accept and reject decisions survive reloads and container restarts, like the draft.
- [ ] A link Naresh types by hand in the editor is just text; the panel doesn't track it.
- [ ] Saving writes the note as it stands in the editor. Pending suggestions are dropped on save or discard.

### 6.5 Settings
- [ ] Settings gets a **Linking** section with a **Linking model** picker, chosen from the same model list as summaries, defaulting to Haiku.
- [ ] The **linker prompt** is editable there, versioned with history and reset to default, as prompt profiles are. A good default is seeded as the initial version. Locked instructions that keep the response shape are always sent with it and shown read-only, as for summaries.
- [ ] A switch turns linking off. When off, jobs go straight from summarizing to review, as in 0.6.0, and **Run linking** is offered on the review screen instead.
- [ ] The section shows whether the agent service is reachable.

## 7. Constraints
- Single user, local. The agent service is a second container in the existing Compose file; whisper-server stays native on the host.
- The app (Express) owns jobs, SQLite, the review queue and every vault write. The agent service only reads the vault and calls Claude.
- Model, prompt version and usage for linking runs are stored in the app's database, not in the note's front-matter.
- New dependencies only as named in the TRD (FastAPI and the Anthropic Python SDK are expected for the service).
- **Naresh initializes the Python project himself** (folder, `pyproject.toml`, tooling) before work starts. The tasks start from that scaffold and don't create it.
- No test touches the network or a real vault. Claude responses come from fixtures, and the vault in tests is a temporary folder of fixture notes.
- The vault is empty when 0.7.0 ships (Naresh wipes it beforehand). No migration of existing notes.

## 8. Out of scope (KIV)
- Semantic search (embeddings) behind the same search tool, once the vault outgrows text search.
- Inserting backlinks into existing notes, and suggesting merges of near-duplicate concepts.
- Creating concept notes (stubs or Claude-written) from popular unresolved concepts.
- Re-linking existing notes in bulk.
- Linking between notes that are both still in review.
- AI tutor and business-idea validator as further endpoints of the vault agent service.
- Job-alert intake and the Freelance jobs page (ADR 0041).
- Claude API Workload Identity Federation; a spend summary built on recorded usage.

## 9. Open questions
None. The technical decisions are in `trd.md` and ADRs 0042–0046.

Decided while drafting:
- A stateless Python service, framed as a reusable vault agent service with `/link` as its first endpoint; Express stays the orchestrator.
- The vault is mounted read-only into the service; Express applies accepted links.
- Text-based vault tools, no embeddings.
- Links only go into the new note; Obsidian provides backlinks.
- Concept links to notes that don't exist yet are allowed, with reuse-first and a naming rule; no stub files.
- Inline at the first occurrence of the anchor phrase, otherwise under `## Related`; at most 8 per note.
- Per-link accept or reject in review, with stale detection and Re-run linking.
- Haiku by default, selectable in Settings; the linker prompt is editable in Settings.
- The vault starts empty; Naresh wipes it before release.
