# 0016. Review edits drafted in localStorage

- Status: Accepted
- Date: 2026-10-15

## Context
Edits on the review screen (title, tags, summary) would be lost on a refresh or accidental navigation.

## Decision
- A `useDraft( jobId )` hook mirrors `{ title, tags, body }` to localStorage under `mnemosyne:draft:<jobId>`.
- The review screen prefers a draft over the server's summary.
- Drafts are cleared on save or discard, and ignored if the job no longer exists.
- All storage access is wrapped in try/catch.

## Consequences
- Edits survive refreshes with no server changes.
- Drafts live in one browser only, which is fine for a single-user local app.

## Alternatives considered
- **Server-side autosave:** a draft endpoint and conflict handling; deferred to a later version.
- **Redux (+ redux-persist):** Redux alone is in memory; persisting it is localStorage with extra steps.
- **Unsaved-changes warning only:** still loses edits on a crash or refresh.
