# 0021. The draft is the whole note as one Markdown string

- Status: Accepted
- Date: 2026-10-16

## Context
0.2.0 stores the summary body, title and tags in separate columns and builds the front-matter at save time. 0.3.0 shows the full note (YAML included) in source mode and the same data as properties in rich mode.

## Decision
- Store the note as one string, front-matter plus body, in `note_markdown`: exactly what goes into the `.md` file.
- Parse and serialize it with the **`yaml`** package through a shared note module, used by both apps.
- The server re-applies the locked properties (source, channel, duration, created, the `mnemosyne` tag) on every draft update and on save, and copies the title into `title` for the job list.
- Invalid YAML is rejected with 400 (`ValidationError`); the client keeps the text until it's fixed.
- Migration 2 backfills `note_markdown` for jobs in review; migration 3, at the end of the version, drops `summary_markdown` and `suggested_tags`. The migration runner accepts functions so the backfill can use TypeScript.
- The root `CLAUDE.md` rule "Markdown is never stored as the canonical data" is about transcripts; it doesn't apply to notes.

## Consequences
- Saving is a file write of what the user saw; source mode can show everything.
- Locked properties can't be trusted from the client, so the server always enforces them.
- A new dependency (`yaml`) in the shared package.

## Alternatives considered
- **Structured columns, YAML generated only on save:** easy validation, but source mode could only show the body.
- **Hand-written YAML helpers (as in 0.2.0):** fine for writing, not for parsing user-edited YAML.
