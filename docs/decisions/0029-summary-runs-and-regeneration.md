# 0029. Summary runs: provenance and cost in the database, and regenerating a summary

- Status: Accepted
- Date: 2026-10-17

## Context
With editable prompts (ADR 0027) and model choice (ADR 0028), Naresh needs to know which model and prompt version produced a note and what it cost, to judge prompts and models. He wants that kept out of the note's front-matter. Iterating on a prompt also needs a way to re-run the summary on a transcript already in review.

## Decision
- **Every summary attempt is a row in `summary_runs`:** job id, model, prompt version, input and output tokens, estimated cost in US dollars, outcome and error. A failed attempt that got a response still records the billed tokens.
- **Runs have no foreign key to jobs**, so they survive saving, discarding and expiry, ready for a spend summary later.
- **Cost is estimated in the app** from a price table in code (`summarizer/pricing.ts`, with the date it was checked), and stored at the time of the run, so later price changes don't rewrite history. Unpriced models record tokens only.
- **Nothing is written to the note.** The job's API shape carries the latest run and totals, and the review screen shows them.
- **Regenerate summary** adds one status transition: `ready_for_review → summarizing`, optionally changing the job's profile and model. The note is replaced when the new summary completes; the vault folder is kept. A failure goes to `summary_failed` with retry, as today.

## Consequences
- Prompts and models can be compared on real videos, with their cost.
- Price estimates can drift from the bill until the table is updated.
- Regenerating discards the current note and its edits; the UI warns before it does.
- Runs accumulate without limit; that's fine at one user's volume.

## Alternatives considered
- **Provenance in the note's front-matter:** visible in Obsidian, but clutters every note. Naresh chose the database only.
- **Usage columns on the job:** simpler, but lost when the job is discarded or expires, and can't hold more than one attempt.
- **Keep the previous note on a failed regenerate:** safer, but needs a second draft slot and more states for a rare case.
