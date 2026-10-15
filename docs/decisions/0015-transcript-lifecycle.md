# 0015. Transcript lifecycle: reviewed, then deleted

- Status: Accepted
- Date: 2026-10-15

## Context
The transcript is now a working artifact: it exists to produce and check the summary. The note in the vault is the lasting output.

## Decision
- New statuses: `summarizing`, `ready_for_review`, `summary_failed`, `saved`; `done` is removed.
- The transcript is kept until the job is saved, discarded or expires, and can be downloaded until then.
- **Save** writes `Mnemosyne/<title>.md` into the vault through a bind mount, never overwriting (`Title (2).md`…), then marks the job `saved` and deletes the transcript.
- **Discard** deletes the job.
- Jobs in `ready_for_review` or `summary_failed` expire after 24 hours (`REVIEW_TTL_HOURS`) and are deleted by a sweeper.

## Consequences
- Nothing large accumulates on disk.
- Re-summarizing a saved video means transcribing it again. That's cheap, because Whisper is local.
- The vault folder is fixed for now; a folder picker is KIV.

## Alternatives considered
- **Keep transcripts indefinitely:** no use for them after review.
- **Obsidian Local REST API plugin or an MCP server:** only works while Obsidian runs, and adds a hop to what is a file write.
