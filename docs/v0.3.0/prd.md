# Mnemosyne v0.3.0 — Product Requirements

## 1. Summary
v0.3.0 polishes the review-and-save step. Naresh can choose where in his vault each note goes, edit the note in a rendered editor that feels like Obsidian, and stop worrying about losing edits: drafts are saved on the server as he types.

## 2. Background
v0.2.0 made Mnemosyne a note-maker: transcribe, summarize with Claude, review, save to Obsidian. Three things were deliberately deferred (v0.2.0 PRD §9):
- Every note lands in one fixed `Mnemosyne/` folder, so notes have to be moved by hand in Obsidian.
- The summary is edited as raw Markdown in a textarea, unlike the rest of his note-taking.
- Edits are kept in one browser's localStorage only, and a review still expires 24 hours after the summary was ready, even while he is working on it.

## 3. Goals
- Each note is saved to the right place in the vault the first time.
- Reviewing a summary feels like editing a note in Obsidian.
- Review edits are never lost to a refresh, a different browser, a crash, or the expiry clock while he is actively working.

## 4. Non-goals (see §9 for the KIV list)
- Remembering the last-used folder, or per-tag folder rules.
- Revision history of a draft, or reverting to Claude's original summary.
- Editing a note after it has been saved to the vault.
- Real-time sync between two open tabs.

## 5. User flow
1. Submit a URL; the job runs as in 0.2.0 up to "ready for review".
2. Open the review screen. The note opens in a rendered editor with a properties panel (title, tags, source, date) above it; the transcript is beside it.
3. Edit in the rendered view, or switch to source mode to see and edit the raw Markdown, front-matter included. Every edit is saved automatically.
4. Optionally pick another vault folder, or create a new one. The filename preview shows the full destination.
5. **Save to vault** → the note is written to the chosen folder. Or **Discard**.
6. A job left untouched in review for 24 hours expires; editing it restarts that clock.

## 6. Features

### 6.1 Vault folder picker
As a user, I want to choose where a note goes so I don't have to file it afterwards.
- [ ] The review screen shows the destination folder, defaulting to the configured default folder (`Mnemosyne/` unless changed).
- [ ] Opening the picker shows every folder in the vault as a tree. Hidden folders (`.obsidian`, `.trash` and any other folder starting with `.`) are not shown.
- [ ] A filter box narrows the tree by folder name, matching anywhere in the vault.
- [ ] I can create a new folder inside any folder (or at the vault root) from the picker. It is created on disk only when the note is saved, so abandoned choices leave no empty folders.
- [ ] Folder names that are invalid on macOS/Obsidian (`/ \ : * ? " < > |`, a leading `.`, `.` or `..`) are rejected with a message.
- [ ] The choice applies to this note only. Every new job starts on the default folder.
- [ ] The choice is part of the draft, so it survives a refresh.
- [ ] The filename preview shows the full path, e.g. `Learning/AI/What Is RAG - A Primer.md`.
- [ ] Nothing is ever written outside the vault, whatever is typed.

### 6.2 Rendered note editor
As a user, I want to edit the summary the way I edit notes in Obsidian.
- [ ] The editor opens in a rendered (WYSIWYG) view: headings, lists, links, bold, quotes and timestamps look like they will in Obsidian.
- [ ] A toggle switches to source mode showing the raw Markdown of the whole note, front-matter included, and back. Edits made in either mode show in the other.
- [ ] Opening a note may tidy it once (`-` for bullets and rules, one trailing newline); after that, switching modes or saving without edits doesn't change it. `[[wikilinks]]`, timestamps, front-matter, quotes and links are never escaped or rewritten (ADR 0023).
- [ ] Placing the cursor on a timestamp scrolls the transcript to that point, in both modes (as in 0.2.0). *Known issue at release: works in tests, not yet in a real browser.*

### 6.3 Properties panel
As a user, I want the note's front-matter shown as fields, like Obsidian's Properties.
- [ ] Above the editor (in rendered mode), the note's properties are shown as fields.
- [ ] **Title:** editable. The filename preview follows it.
- [ ] **Tags:** editable chips; Claude's suggestions can be removed and new tags added. The `mnemosyne` tag is always present and cannot be removed.
- [ ] **Source, channel, duration, created:** shown read-only.
- [ ] Changes in the panel and changes to the YAML in source mode are the same data; each shows in the other.
- [ ] If the front-matter is edited into invalid YAML in source mode, I see "front-matter invalid" and my text is kept in the editor until I fix it; nothing invalid is saved.
- [ ] Even if I edit or delete locked properties in source mode, the saved note always has the correct source, channel, duration, created date and the `mnemosyne` tag.

### 6.4 Server-side autosave
As a user, I want my review edits saved without thinking about it.
- [ ] Edits to the note and the folder choice are saved to the server shortly (about 1–2 seconds) after I stop typing, when I switch editor modes, when the editor loses focus, and before **Save to vault**.
- [ ] A status shows "Saving…", "Saved" or "Not saved: <reason>".
- [ ] Reloading the page, or opening the job in another browser, shows the latest saved draft.
- [ ] Leaving the page with an unsaved edit pending warns me first.
- [ ] Every autosave restarts the 24-hour expiry; the expiry shown on the job list and review screen updates.
- [ ] The vault is only written on **Save to vault**; autosave never touches it.
- [ ] Autosave replaces the 0.2.0 localStorage drafts.

## 7. Note format
Unchanged from 0.2.0 (front-matter + summary, key points, quotes), except that timestamps for non-YouTube sources are written as `(12:34)` instead of `[12:34]`. The difference is that the stored draft is now the whole note, front-matter included. `created` is the date the note is saved to the vault.

## 8. Constraints
- Single user, local, as before.
- The vault is already mounted at its root in Docker (`VAULT_HOST_PATH` → `/vault`); 0.3.0 makes use of the whole mount.

## 9. Out of scope for 0.3.0 (KIV)
- Model selection from the UI
- Workload Identity Federation instead of an API key
- Vault-aware agent that adds `[[wikilinks]]` to related notes
- Remembering the last-used folder / folder rules by tag
- Live progress via SSE
- Mnemosyne as an MCP server for querying past notes

## 10. Open questions
None.
