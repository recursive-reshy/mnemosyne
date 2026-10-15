# 0017. Commit docs/ and the CLAUDE.md files

- Status: Accepted
- Date: 2026-10-15

## Context
In 0.1.0, `docs/` and the CLAUDE.md files were git-ignored. In the spec-driven workflow (ADR 0018), Claude Code works from these files and updates them alongside code, so they need history.

## Decision
- `docs/`, every `CLAUDE.md` and `.claude/commands/` are committed.
- Plans and task status change in the same commits as the code they describe.

## Consequences
- Each commit shows the code and the plan state together.
- Anything written in these files is in the repo, so they must never contain secrets.

## Alternatives considered
- **Keep them ignored:** Claude Code's commits would not record plan progress, and the docs would have no history.
