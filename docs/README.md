# Docs

## Plans

Each version has its own folder. The current version is 0.6.0.

- **v0.7.0 (planned):** [PRD](v0.7.0/prd.md) · [TRD](v0.7.0/trd.md) · [Tasks](v0.7.0/tasks.md) · checkpoint plans in `v0.7.0/plans/`
- **v0.6.0 (done):** [PRD](v0.6.0/prd.md) · [TRD](v0.6.0/trd.md) · [Tasks](v0.6.0/tasks.md) · [Release notes](v0.6.0/release-notes.md) · checkpoint plans in `v0.6.0/plans/`
- **v0.5.0 (done):** [PRD](v0.5.0/prd.md) · [TRD](v0.5.0/trd.md) · [Tasks](v0.5.0/tasks.md) · [Release notes](v0.5.0/release-notes.md) · checkpoint plans in `v0.5.0/plans/`
- **v0.4.0 (done):** [PRD](v0.4.0/prd.md) · [TRD](v0.4.0/trd.md) · [Tasks](v0.4.0/tasks.md) · [Release notes](v0.4.0/release-notes.md) · checkpoint plans in `v0.4.0/plans/`
- **v0.3.1 (done):** [PRD](v0.3.1/prd.md) · [TRD](v0.3.1/trd.md) · [Tasks](v0.3.1/tasks.md) · checkpoint plans in `v0.3.1/plans/`
- **v0.3.0 (done):** [PRD](v0.3.0/prd.md) · [TRD](v0.3.0/trd.md) · [Tasks](v0.3.0/tasks.md) · [Release notes](v0.3.0/release-notes.md) · checkpoint plans in `v0.3.0/plans/`
- **v0.2.0 (done):** [PRD](v0.2.0/prd.md) · [TRD](v0.2.0/trd.md) · [Tasks](v0.2.0/tasks.md) · checkpoint plans in `v0.2.0/plans/`
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
| [0011](decisions/0011-web-stack.md) | Web app: Vite, React, plain CSS, hand-written polling | Partly superseded by 0013, 0024 |
| [0012](decisions/0012-sqlite-job-store.md) | SQLite job store with better-sqlite3 | Accepted |
| [0013](decisions/0013-tanstack-query-react-router.md) | TanStack Query and React Router | Accepted |
| [0014](decisions/0014-claude-summarizer.md) | Summaries with the Claude API, called from the server | Accepted (amended by 0027, 0028, 0030) |
| [0015](decisions/0015-transcript-lifecycle.md) | Transcript lifecycle: reviewed, then deleted | Accepted (amended by 0030) |
| [0016](decisions/0016-local-drafts.md) | Review edits drafted in localStorage | Superseded by 0020 |
| [0017](decisions/0017-commit-docs-and-claude-md.md) | Commit docs/ and the CLAUDE.md files | Accepted |
| [0018](decisions/0018-spec-driven-workflow.md) | Spec-driven workflow with checkpoints | Accepted |
| [0019](decisions/0019-mdxeditor-note-editor.md) | MDXEditor for the note editor | Accepted |
| [0020](decisions/0020-server-side-drafts.md) | Server-side drafts | Accepted |
| [0021](decisions/0021-note-as-one-markdown-string.md) | The draft is the whole note as one Markdown string | Accepted |
| [0022](decisions/0022-vault-wide-folder-picker.md) | Vault-wide folder picker, writes confined to the vault | Accepted |
| [0023](decisions/0023-mdxeditor-round-trip-contract.md) | MDXEditor round-trip contract | Accepted (amended by 0026) |
| [0024](decisions/0024-material-ui-single-ui-library.md) | Material UI as the single UI library | Accepted |
| [0025](decisions/0025-app-shell-drawer-and-colour-mode.md) | App shell: navigation drawer and colour mode | Accepted |
| [0026](decisions/0026-bold-around-a-link-is-normalised.md) | Bold around a link is normalised to link around bold | Accepted |
| [0027](decisions/0027-editable-summarizer-prompts.md) | Editable summarizer prompts: profiles of versioned guidance on a locked contract | Accepted |
| [0028](decisions/0028-summary-model-from-models-api.md) | Summary model chosen in the app, listed from the Models API | Accepted |
| [0029](decisions/0029-summary-runs-and-regeneration.md) | Summary runs: provenance and cost in the database, and regenerating a summary | Accepted |
| [0030](decisions/0030-source-adapters-and-intakes.md) | Source adapters and intakes: one `SourceDocument` for every source | Accepted |
| [0031](decisions/0031-article-extraction.md) | Article extraction: Readability on linkedom, turndown to Markdown, fetch limits | Accepted |
| [0032](decisions/0032-rss-feeds-inbox-poller.md) | RSS feeds with feedsmith, an inbox before summarizing, and a separate poller | Accepted (amended by 0038) |
| [0033](decisions/0033-browser-mode-tests.md) | Browser-mode tests with Vitest and Playwright for real-DOM behaviour | Accepted |
| [0034](decisions/0034-caret-sync-paragraph-and-front-matter.md) | Caret sync: match paragraphs by whole second, and ignore the front-matter | Accepted |
| [0035](decisions/0035-gmail-intake.md) | Gmail intake: `@googleapis/gmail`, server-side OAuth, an encrypted refresh token, and a date-window sync | Accepted |
| [0036](decisions/0036-newsletters-email-to-markdown.md) | Newsletters: email to Markdown with Readability first and unwrapped layout tables as fallback | Accepted (amended by 0040) |
| [0037](decisions/0037-job-postings-dataset.md) | Job postings: Claude extraction into fixed columns plus JSON, deduplicated by platform job ID | Accepted (deferred by 0041) |
| [0038](decisions/0038-unified-inbox.md) | One inbox for feed items and newsletter emails | Accepted |
| [0039](decisions/0039-feed-item-schemas-server-local.md) | Feed-item schemas stay server-local until the unified inbox routes land | Superseded (by the 0038 routes, tasks 8.4–8.5) |
| [0040](decisions/0040-newsletters-whole-body.md) | Newsletters: convert the whole cleaned body, not Readability's best block | Accepted |
| [0041](decisions/0041-defer-job-alert-intake.md) | Defer job-alert intake and the Freelance jobs page to a later version | Accepted |
| [0042](decisions/0042-vault-agent-service.md) | A stateless Python vault agent service, with the vault mounted read-only | Proposed |
| [0043](decisions/0043-agent-contract.md) | Agent contract: Pydantic is the source, Zod mirrors it, shared examples catch drift | Proposed |
| [0044](decisions/0044-wikilinks-concepts-and-agent-loop.md) | Wikilinks: links only from the new note, concept links, text-tool search and computed kinds | Proposed |
| [0045](decisions/0045-per-link-review.md) | Per-link review: shared insertion functions and one transaction per accept | Proposed |
| [0046](decisions/0046-linker-prompt-and-settings.md) | Linker prompt as a prompt profile with a purpose; locked instructions owned by the agent service | Proposed |

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
