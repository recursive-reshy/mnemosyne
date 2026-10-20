# 0041. Defer job-alert intake and the Freelance jobs page to a later version

- Status: Proposed
- Date: 2026-10-20

## Context
v0.6.0 planned two Gmail destinations: newsletters into the inbox, and freelance job alerts (Upwork, Freelancer.com) extracted by Claude into a postings dataset with a Freelance jobs page (ADR 0037). Checkpoints A–D are done: the Gmail connection, sources, newsletters and the unified inbox work, and the postings contracts and tables were built in checkpoint A. Naresh has no Upwork or Freelancer.com alerts in his mailbox yet, so there are no real samples to build and test the extraction against.

## Decision
- **Job-alert intake and the Freelance jobs page move to a later version.** The PRD's §6.4–6.5 and the TRD's §7, §10.4 (except the drawer warning) and §10.5 stay in the 0.6.0 docs, marked deferred, as that version's starting point. ADR 0037's design still stands for it.
- **Nothing already built is removed.** The postings contracts in `packages/shared`, `extraction_model` in settings, and the postings tables in migration 6 stay, unused. Removing them would mean editing a migration that dev databases have already run, for no gain.
- **Jobs sources can't be created in v0.6.0.** The server refuses `destination: 'jobs'` with a 400; the Add source form has no destination choice and always creates a newsletter source. `GmailDestination` keeps both values, so the later version needs no contract change.
- The drawer warning when Gmail needs reconnecting (planned with the Freelance jobs page) ships in v0.6.0, since it concerns the connection.

## Consequences
- v0.6.0 ships sooner, with only the newsletter half of the Gmail intake.
- Job alerts that arrive before the later version aren't collected; that version can backfill them from Gmail (the deferred §6.4 currently says jobs sources don't backfill, which it should revisit).
- Empty postings tables and an unused setting sit in the schema until then.

## Alternatives considered
- **Build extraction on invented fixtures:** possible, but the dedupe key and prompt depend on what real alerts contain, which is exactly what is unknown.
- **Remove the postings schema and contracts:** cleaner, but churn now and again later, plus a migration edit.
- **Keep the jobs destination selectable, collecting raw emails without extraction:** gathers data early, but leaves a half-feature in the UI with nothing to show.
