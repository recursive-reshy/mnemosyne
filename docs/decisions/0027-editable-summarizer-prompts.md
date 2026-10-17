# 0027. Editable summarizer prompts: profiles of versioned guidance on a locked contract

- Status: Accepted
- Date: 2026-10-17
- Amends: 0014

## Context
The 0.3 summarizer uses one generic prompt in code (ADR 0014). Naresh wants to change what it extracts without a deploy, with different prompts for business and coding videos. Prompt work is trial and error, so changes must be easy to undo. At the same time the server parses the model's output into a fixed shape (overview, key points, quotes, tags) and turns it into a note; an edit must not be able to break that.

## Decision
- **The system prompt has two parts.** `LOCKED_INSTRUCTIONS` (in code, shown read-only in the UI) describes the transcript format and the output contract. The **guidance** (editable) says what to focus on. They are joined as locked text, then the guidance in `<guidance>` tags, and the locked part says it wins on conflict.
- **Guidance lives in named profiles**, stored in SQLite (`prompt_profiles`, `prompt_versions`). One profile is the default (a setting); the submit form and the regenerate dialog can pick another for one job.
- **Every save is a new version.** History is append-only: restoring an old version or resetting to the shipped text inserts a copy as the newest version. Identical saves are ignored.
- **Three profiles ship**, seeded by migration 4 as version 1: Business ideas (default), Coding and General (the 0.3 prompt). The seed uses the constants as they are at that time; later changes to the shipped text affect only **Reset to default**.
- **Profiles are soft-deleted**, so runs that used them keep their name. The default profile and the last active one can't be deleted.
- A job stores the profile it chose (or none, meaning the default at summarize time); the prompt version is resolved when the summary starts.

## Consequences
- Prompt changes need no deploy and can always be undone.
- No edit can change the note's structure; changing the structure still needs code.
- A few more tables and endpoints, and a Settings page to maintain.
- The output contract and the guidance can disagree (for example, guidance asking for headings); the locked part wins, which may surprise. It is shown in the UI for that reason.

## Alternatives considered
- **The whole prompt editable:** maximum control, but one careless edit breaks tag parsing or note generation.
- **A prompt file in the repo or the vault:** needs a restart or file watching, and has no history of its own beyond git.
- **One prompt with history, no profiles:** simpler, but business and coding videos need different framing, and switching back and forth would bury the history.
