# 0018. Spec-driven workflow with checkpoints

- Status: Accepted
- Date: 2026-10-15

## Context
In 0.1.0, each slice was a handoff pasted from Claude Desktop into Claude Code, with results pasted back. That kept Naresh in every loop and spread the plan across chats.

## Decision
- Each version has `docs/v<version>/prd.md`, `trd.md` and `tasks.md`. Claude Desktop drafts the PRD and TRD with Naresh; only Naresh edits them.
- Tasks are grouped into checkpoints of one or two phases. At the start of each checkpoint, Claude Code writes one plan in plan mode. Naresh approves it, and it is saved to `plans/checkpoint-<x>.md`.
- Claude Code then works through the checkpoint's tasks TDD-first, with one commit per task, pushed to `main`. It stops at the end of the checkpoint and reports.
- Undecided questions stop work. The answer becomes an ADR, which overrides the TRD until Naresh updates it.
- History is never rewritten (no amend, force-push or reset).
- A `/next-task` command starts each session.

## Consequences
- Naresh reviews plans and finished checkpoints instead of every step.
- The docs, not chat history, are the source of truth.

## Alternatives considered
- **Taskmaster:** an AI-generated backlog that would compete with the docs; overkill for one person.
- **GitHub Spec Kit:** more ceremony than a solo project needs.
- **Keep pasted handoffs:** slow, and the plan lives in chats.
