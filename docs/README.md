# Docs

## Plans

Each version has its own folder. The current version is 0.2.0.

- **v0.2.0:** [PRD](v0.2.0/prd.md) · [TRD](v0.2.0/trd.md) · [Tasks](v0.2.0/tasks.md) · checkpoint plans in `v0.2.0/plans/`
- **v0.1.0 (done):** [Server](v0.1.0/implementation-server.md) · [Web](v0.1.0/implementation-web.md)

## Architecture decisions

Each significant decision is recorded as a short ADR (Architecture Decision Record) in `decisions/`. ADRs are append-only: to change a decision, add a new ADR that supersedes the old one and update the old one's status.

| # | Decision | Status |
|---|----------|--------|
| [0001](decisions/0001-monorepo-pnpm-workspaces.md) | Monorepo with pnpm workspaces | Accepted |
| [0002](decisions/0002-local-whisper-transcription.md) | Local transcription with whisper.cpp | Accepted |
| [0003](decisions/0003-audio-acquisition-yt-dlp-ffmpeg.md) | Audio acquisition with yt-dlp and ffmpeg | Accepted |
| [0004](decisions/0004-runtime-docker-plus-native-whisper.md) | App in Docker, Whisper native on the host | Accepted |
| [0005](decisions/0005-markdown-first-output.md) | Markdown-first output, Obsidian-ready | Accepted |
| [0006](decisions/0006-async-job-model.md) | Asynchronous job model | Partly superseded by 0012, 0015 |
| [0007](decisions/0007-tdd-vitest-supertest.md) | TDD with Vitest and Supertest | Accepted |
| [0008](decisions/0008-zod-for-validation-and-contracts.md) | Zod for validation and contracts | Accepted |
| [0009](decisions/0009-code-style-and-eslint.md) | Code style enforced by ESLint, check-only | Accepted |
| [0010](decisions/0010-typescript-6-for-eslint.md) | TypeScript 6 until typescript-eslint supports TypeScript 7 | Accepted |
| [0011](decisions/0011-web-stack.md) | Web app: Vite, React, plain CSS, hand-written polling | Partly superseded by 0013 |
| [0012](decisions/0012-sqlite-job-store.md) | SQLite job store with better-sqlite3 | Accepted |
| [0013](decisions/0013-tanstack-query-react-router.md) | TanStack Query and React Router | Accepted |
| [0014](decisions/0014-claude-summarizer.md) | Summaries with the Claude API, called from the server | Accepted |
| [0015](decisions/0015-transcript-lifecycle.md) | Transcript lifecycle: reviewed, then deleted | Accepted |
| [0016](decisions/0016-local-drafts.md) | Review edits drafted in localStorage | Accepted |
| [0017](decisions/0017-commit-docs-and-claude-md.md) | Commit docs/ and the CLAUDE.md files | Accepted |
| [0018](decisions/0018-spec-driven-workflow.md) | Spec-driven workflow with checkpoints | Accepted |

## Template for new ADRs

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
What problem or constraint forced a decision.

## Decision
What we chose.

## Consequences
What becomes easier, what becomes harder, what we accept.

## Alternatives considered
Options rejected and why.
```
