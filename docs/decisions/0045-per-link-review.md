# 0045. Per-link review: shared insertion functions and one transaction per accept

- Status: Accepted
- Date: 2026-10-21

## Context
Naresh wants to accept or reject each proposed link before a note is saved. Accepting changes both the note text and the suggestion's status. The editor (MDXEditor) holds unsaved edits and autosaves on a debounce; wikilinks already survive its round-trip (`wikilinkMarkdown.ts`).

## Decision
- **Pure functions in `packages/shared/src/wikilinks.ts`:** `findAnchor` (first eligible exact, word-bounded occurrence, never in front-matter, headings, existing wiki or Markdown links, code or blockquotes), `insertLink` (`[[Target]]` or `[[Target|anchor]]`, or a bullet under `## Related`, created if missing; a no-op when the note already links to the target) and `isStale`.
- **The web app inserts.** It runs `insertLink` on the editor's current Markdown, sets it in the editor, and sends the result. The server does not redo the insertion: the editor's text, with unsaved edits, is the truth.
- **One request, one transaction.** `POST /api/jobs/:id/link-suggestions/accept` takes suggestion IDs and the resulting `note_markdown`; the server validates the note as a draft save does, stores it and the decisions together, and restarts the expiry. Accept all is the same request with every pending ID. Reject is a status change only.
- **Stale is computed, not stored.** A suggestion with an anchor that `findAnchor` can't place is stale; it can still be accepted into Related.
- **Re-running** supersedes pending suggestions; decided and superseded rows are kept with the job (useful for tuning the prompt later) and deleted with it.

## Consequences
- Note text and decisions can't drift apart through a reload between two requests.
- One tested implementation of insertion, used by the web and available to the server.
- In rich-text mode, wikilinks show as plain `[[…]]` text; a styled chip needs a custom MDXEditor plugin (KIV).

## Alternatives considered
- **Server-side insertion:** the server doesn't have the editor's unsaved edits; it would overwrite them or need a merge.
- **Autosave plus a separate decision request:** two writes that can disagree after a reload.
- **Storing stale:** it changes as Naresh types.
