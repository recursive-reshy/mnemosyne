# 0009. Code style enforced by ESLint, check-only

- Status: Accepted
- Date: 2026-10-14

## Context
Code is mostly written by Claude Code from handoffs, so the style must be written down precisely and checked automatically. The style follows the My Team codebase.

## Decision
- The full TypeScript style is defined in each app's `CLAUDE.md`. Key points: spaces inside non-empty brackets, no semicolons, single quotes, 100-character lines with one argument per line when a call or signature would pass that, grouped imports with comments.
- **ESLint enforces it as a check only.** There is no formatter, and `--fix` is never run automatically.
- **File naming:**
  - Server and other Node code: camelCase with a role suffix (`jobs.service.ts`, `whisperServer.client.ts`).
  - React: PascalCase for component files (`UrlForm.tsx`), camelCase for everything else (`api.ts`, `useJobPolling.ts`).

## Consequences
- Style violations show up as lint errors to fix by hand, so code stays exactly as written and reviewed.
- An ESLint config must be added to each app (a later handoff).
- camelCase file names on macOS's case-insensitive file system: a rename that only changes case needs `git mv`.

## Alternatives considered
- **Prettier:** consistent and automatic, but can't express this style (spaces inside brackets, keyword spacing) and rewrites code on save.
- **kebab-case file names:** common in the npm ecosystem and avoids the case issue, but camelCase was preferred.
