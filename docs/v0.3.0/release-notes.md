# Mnemosyne v0.3.0 — Release notes

Released 2026-10-16. Tag `v0.3.0`.

v0.3.0 is the review-and-save polish release. You can choose where each note goes in your vault, edit notes in a rendered editor that works like Obsidian, and your edits are saved on the server as you type.

## New

### Choose the vault folder for each note
- The review screen shows where the note will be saved, starting on the default folder (`Mnemosyne/`).
- Pick any folder in the vault from a tree, or filter it by name. Hidden folders such as `.obsidian` and `.trash` aren't shown.
- Create new folders, nested anywhere, straight from the picker. They're only created on disk when you save, so changing your mind leaves no empty folders behind.
- The filename preview shows the full destination, e.g. `Learning/AI/What Is RAG - A Primer.md`.
- The choice applies to that note only; every new job starts on the default folder again.

### Rendered note editor
- Notes open in a rendered (WYSIWYG) view: headings, lists, quotes, links and code look the way they will in Obsidian.
- Switch to **Source** mode to see and edit the raw Markdown of the whole note, front-matter included, and back again.
- `[[wikilinks]]` and timestamps are kept exactly as written.

### Properties panel
- In the rendered view, the note's front-matter is shown as fields above the text, like Obsidian's Properties.
- Title and tags are editable. The `mnemosyne` tag is always there and can't be removed.
- Source, channel, duration and created date are read-only, and the server enforces them even if you edit them in source mode.

### Autosave
- Edits and the folder choice are saved to the server about 1.5 seconds after you stop typing, and whenever you switch modes, leave the editor or save.
- A status line shows "Saving…", "Saved" or what went wrong.
- Reload the page, or open the job in another browser, and your latest draft is there.
- Leaving the page with unsaved edits asks you first.
- Working on a review restarts its 24-hour expiry, so it won't expire while you're editing it.
- The vault is only touched when you press **Save to vault**.

## Changes
- **Plain timestamps** for non-YouTube sources are now written as `(12:34)` instead of `[12:34]`. Notes already in your vault are unchanged.
- **Bullets and rules** are written as `-` and `---`. A `*` bullet typed in source mode becomes `-`.
- **Drafts in localStorage are gone.** Drafts now live on the server, and any old browser drafts are cleared automatically.

## Upgrading
1. **Back up your database first.** Migration 3 can't be undone, and a 0.2.0 build won't start on a migrated database.
   ```bash
   docker compose stop
   mkdir -p ~/mnemosyne-backup
   docker run --rm -v mnemosyne_mnemosyne-data:/data -v ~/mnemosyne-backup:/backup alpine sh -c 'cp /data/mnemosyne.db* /backup/'
   ```
2. Rebuild: `docker compose up -d --build`.
3. On startup the database migrates from version 1 to version 3. Jobs waiting for review keep their summaries as editable drafts.
4. Optional: set `DEFAULT_NOTE_FOLDER` in `.env` to change the default folder (vault-relative, default `Mnemosyne`). No other configuration changes are needed; the vault was already mounted at its root.

## Known issues
- **Timestamp caret sync doesn't work in a real browser.** Clicking or moving the cursor onto a timestamp doesn't scroll the transcript, although the automated tests pass.
- **Wikilinks show as plain text** in the rendered view rather than as links. They're saved correctly.
- **Old `[12:34]` timestamps** in jobs that were in review during the upgrade may come back as `\[12:34]` if edited in the rendered view.
- **Tables, images and HTML** can't be shown in the rendered view; notes containing them stay in source mode. Summaries never produce them.
- **The web bundle is about 1.5 MB** (about 500 kB gzipped), mostly the editor. That's fine on localhost; lazy-loading the editor is a follow-up.

## Under the hood
- The draft is stored as the whole note (front-matter plus body) in one `note_markdown` column, parsed with the `yaml` package through a shared note module used by both apps.
- New endpoints: `PATCH /api/jobs/:id/draft` and `GET /api/vault/folders`. `POST /api/jobs/:id/save` no longer takes a body; it saves the stored draft.
- Folder paths are validated with the same rules on both sides and resolved with `realpath` checks before and after creating folders, so nothing is ever written outside the vault.
- The editor is MDXEditor, with a small local handler that keeps wikilinks verbatim.
- Database migrations 2 and 3: add `note_markdown` and `target_folder` and backfill them, then drop `summary_markdown` and `suggested_tags`.
- Tests: 157 shared, 493 server and 330 web, all passing, plus lint and typecheck clean.

## Decisions
New ADRs: [0019](../decisions/0019-mdxeditor-note-editor.md) MDXEditor · [0020](../decisions/0020-server-side-drafts.md) server-side drafts (supersedes 0016) · [0021](../decisions/0021-note-as-one-markdown-string.md) the note as one Markdown string · [0022](../decisions/0022-vault-wide-folder-picker.md) vault-wide folder picker · [0023](../decisions/0023-mdxeditor-round-trip-contract.md) MDXEditor round-trip contract.
