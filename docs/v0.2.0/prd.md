# Mnemosyne v0.2.0 — Product Requirements

## 1. Summary
v0.2.0 turns Mnemosyne from a transcriber into a note-maker. After a video is transcribed, Claude summarizes it; Naresh reviews and edits the summary next to the transcript, then saves it as a note in his Obsidian vault. The transcript is a working artifact only: it is deleted once the note is saved or discarded.

## 2. Background
v0.1.0 takes a URL (e.g. YouTube), downloads the audio, transcribes it with a local whisper.cpp server, and produces a Markdown transcript. Typical input is a 1–2 hour talk. The raw transcript is too long to be useful in Obsidian; what Naresh wants in the vault is a concise, reviewable summary that links back to the source.

## 3. Goals
- Every transcribed video produces an AI summary without extra steps.
- Naresh can verify the summary against the transcript before anything reaches the vault.
- Saving writes a well-formed Obsidian note into the vault in one click.
- No work is lost to a refresh, a container restart, or a failed API call.

## 4. Non-goals (see §9 for the KIV list)
- Choosing the vault folder per note, rendered/WYSIWYG editing, model selection in the UI.
- Linking the summary to existing vault notes.
- Keeping transcripts long-term.

## 5. User flow
1. Submit a URL on the home screen.
2. The job progresses: queued → downloading → converting → transcribing → summarizing → ready for review.
3. Open the job's review screen: edit the title, tags and summary; check claims against the transcript.
4. **Save to vault** → the note is written; the transcript is deleted. Or **Discard** → everything is deleted.
5. Jobs left in review are deleted automatically after 24 hours.

## 6. Features

### 6.1 Automatic summarization
As a user, I want each transcript summarized automatically so I don't have to read 2 hours of text.
- [ ] Summarization starts automatically when transcription completes; status shows "summarizing".
- [ ] Uses Claude Sonnet via the Claude API, with a generic summary prompt.
- [ ] Produces: a summary (a few paragraphs), key points with timestamps, notable quotes with timestamps, and 3–5 suggested tags.
- [ ] Quotes that do not appear verbatim in the transcript are removed; timestamps beyond the video's duration are removed.
- [ ] Suggested tags are lowercase and hyphenated (e.g. `machine-learning`).
- [ ] Handles videos up to at least 2 hours in a single summary.
- [ ] Timestamps link to that moment in the video for YouTube sources; for other sources they are shown as plain timestamps without links.

### 6.2 Summary failure and retry
As a user, I don't want an API hiccup to cost me a re-transcription.
- [ ] If summarization fails (network, rate limit, invalid response), the job shows "summary failed" with the reason.
- [ ] The transcript is kept, and a **Retry summary** button re-runs summarization only.
- [ ] Failed jobs expire on the same 24-hour rule as jobs in review.

### 6.3 Review screen
As a user, I want to check and edit the summary against the source before saving.
- [ ] Each job has its own URL (`/jobs/:id`) so I can return to it later.
- [ ] Layout: title and tags at the top; editable summary (raw Markdown textarea) on the left; read-only transcript on the right; Save and Discard at the bottom.
- [ ] The title defaults to the video title and is editable.
- [ ] Tags show the fixed `mnemosyne` tag plus Claude's suggestions; tags can be added and removed.
- [ ] The final vault filename is shown under the title and updates as the title changes (e.g. `Mnemosyne/What Is RAG - A Primer.md`).
- [ ] Placing the cursor on a timestamp in the summary scrolls the transcript to that point.
- [ ] Edits to title, tags and summary survive a page refresh or navigating away (same browser), and are cleared on save or discard.
- [ ] A **Download transcript** button saves the transcript as Markdown, available until the job is saved or discarded.

### 6.4 Save to Obsidian
As a user, I want the reviewed summary saved as a note in my vault.
- [ ] Notes are written to a fixed `Mnemosyne/` folder inside the configured vault path; the folder is created if missing.
- [ ] The note format follows §7.
- [ ] Filenames are derived from the title with invalid characters removed.
- [ ] An existing note is never overwritten: a clash produces `Title (2).md`, `Title (3).md`, etc.
- [ ] After saving, I return to the home screen with a confirmation showing the saved path.
- [ ] After a successful save, the transcript for that job is deleted, so the transcript can no longer be downloaded.

### 6.5 Discard and expiry
- [ ] **Discard** deletes the job and its transcript, and the job disappears from the home list immediately.
- [ ] Jobs in "ready for review" or "summary failed" are deleted 24 hours after reaching that state.
- [ ] The home list shows the time remaining on those jobs (e.g. "expires in 5h").

### 6.6 Home screen job list
- [ ] Below the URL input, the home screen lists jobs that are in progress, ready for review, or summary failed, with their status.
- [ ] In-progress jobs update without a manual refresh.
- [ ] Each job links to its review screen when relevant.

### 6.7 Persistence
- [ ] Jobs, their status, summaries and transcripts survive a container restart or rebuild.
- [ ] Jobs that were mid-processing when the app stopped are marked failed on startup instead of appearing stuck.

## 7. Note format
```markdown
---
title: How Transformers Work
source: https://youtube.com/watch?v=…
channel: Some Channel
duration: 1:42:10
created: 2026-10-15
tags: [mnemosyne, machine-learning, transformers]
---

## Summary
…

## Key points
- Point one ([12:34](https://youtube.com/watch?v=…&t=754))

## Notable quotes
> "…" ([1:05:20](…))
```

## 8. Constraints
- Single user, running locally on Naresh's Mac (app in Docker, whisper.cpp native).
- Requires a Claude API key in the app's environment; summaries cost a small amount per video.
- The vault is reached through a folder mounted into the container.

## 9. Out of scope for 0.2.0 (KIV)
- Rendered / toggle Markdown editor
- Per-note vault folder picker
- Model selection from the UI
- Server-side draft autosave
- Live progress via SSE
- Mnemosyne as an MCP server for querying past notes
- Vault-aware agent that adds `[[wikilinks]]` to related notes
- Workload Identity Federation instead of an API key (if deployed to the cloud)

## 10. Open questions
None.