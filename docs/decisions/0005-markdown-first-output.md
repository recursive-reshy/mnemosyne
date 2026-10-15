# 0005. Markdown-first output, Obsidian-ready

- Status: Accepted
- Date: 2026-10-14

## Context
Transcripts are meant to end up as notes in Obsidian. Future features include summaries and writing notes straight into the vault.

## Decision
- The **canonical stored format** is structured data: transcript metadata plus timestamped segments (types in `packages/shared`).
- **Formatters are pure functions** from transcript to string: Markdown (default), SRT, TXT.
- Markdown output:
  - YAML frontmatter: `title`, `source`, `channel`, `duration`, `transcribed`, `model`, `tags`.
  - Segments grouped into readable paragraphs, each starting with a timestamp link back to that moment in the video (e.g. `[02:15](https://youtu.be/...?t=135)`).

Example:

```markdown
---
title: "Video title"
source: https://www.youtube.com/watch?v=...
channel: "Channel name"
duration: "41:12"
transcribed: 2026-10-14
model: large-v3-turbo
tags: [transcript, youtube]
---

# Video title

[00:00](https://youtu.be/...?t=0) Opening paragraph...
```

## Consequences
- Frontmatter becomes Obsidian properties, searchable and queryable (e.g. Dataview).
- New output formats or a summary section are just new formatters; no re-transcription.
- Future Obsidian integration (writing into a vault folder mounted as a Docker volume) needs no format changes.

## Alternatives considered
- **Storing Markdown directly:** simpler at first, but makes other formats and re-rendering harder.
- **One line per Whisper segment:** reads poorly; segments are only a sentence or two each.
