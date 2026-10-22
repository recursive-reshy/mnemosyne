# 0057. Note identity: path plus body hash, on-demand scans

- Status: Proposed
- Date: 2026-10-22

## Context
Melete tracks vault notes it may not write to (ADR 0054), including notes Naresh writes himself without Mnemosyne front-matter. Notes get renamed, moved between subject folders and edited in Obsidian. Melete needs to keep a note's questions and history across renames and moves, and regenerate questions when the content changes.

## Decision
- A note row stores its vault-relative **path**, a **body hash** (SHA-256 of the body without front-matter, line endings normalised, trailing whitespace trimmed, outer blank lines removed), `mtime_ms` and `size`.
- **Scans run on demand** when Melete's pages or the review queue load (at most every 30 seconds, one at a time), not with a file watcher or background poll. Files whose mtime and size are unchanged aren't re-read.
- **Move detection:** a new path whose hash matches exactly one note that is missing or whose old path wasn't seen is that note moved. Edit and move together, or duplicate bodies, count as a new note.
- **Changed content:** an enrolled note's active questions are retired and generation is queued. A front-matter-only or whitespace-only change doesn't count.
- **Missing notes** are marked, not deleted: their questions drop out of reviews and come back if the path or body reappears.
- A subject is a direct child folder of the learning root; its settings (auto-enroll, new per day) are keyed by folder and don't follow a folder rename.

## Consequences
- No ids in notes and no writes to the vault.
- Renames and moves in Obsidian keep review history; a big edit plus rename costs regenerated questions, nothing else.
- Melete's view of the vault can be up to 30 seconds old, which doesn't matter for study.
- Scans cost a directory walk and a few reads; fine for hundreds of notes, capped at 5000 per scan.

## Alternatives considered
- **Path only:** simplest, but every tidy-up in Obsidian throws away history.
- **An id in front-matter:** reliable, but breaks read-only access and doesn't cover hand-written notes until something writes to them.
- **A file watcher:** instant, but a long-running watcher on a Docker bind mount is unreliable on macOS and nothing needs to happen while Melete isn't open.
