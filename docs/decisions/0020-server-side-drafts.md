# 0020. Server-side drafts

- Status: Proposed
- Date: 2026-10-16
- Supersedes: 0016

## Context
0.2.0 keeps review edits in one browser's localStorage (ADR 0016). Edits don't follow Naresh to another browser, and a review expires 24 hours after the summary was ready, even while he is working on it.

## Decision
- The web app autosaves the draft with `PATCH /api/jobs/:id/draft` (debounced about 1.5 s, flushed on mode toggle, blur, folder change and before save).
- The draft overwrites the job's note in place. Claude's original summary isn't kept; editor undo covers the session.
- Every autosave resets `expires_at` to now + `REVIEW_TTL_HOURS`.
- Save takes no body: it writes whatever the stored draft holds.
- Last write wins between tabs; no conflict detection.
- `useDraft` and its localStorage keys are removed.

## Consequences
- Edits survive refreshes, crashes and a change of browser, and active reviews don't expire.
- One source of truth for what gets saved.
- No "revert to Claude's version" after a reload.

## Alternatives considered
- **Keep the original summary in its own column:** enables a revert button; Naresh doesn't need it.
- **Keep localStorage alongside the server draft:** two sources of truth to reconcile, for no gain on a local app.
