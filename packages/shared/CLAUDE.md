# packages/shared

Cross-app contracts for Mnemosyne: Zod schemas and their inferred types, imported by the server and the web app as `@mnemosyne/shared`. The root `CLAUDE.md` covers the workflow, precedence, git and secrets.

- Follow the TypeScript style in `apps/server/CLAUDE.md`.
- Schemas and their inferred types live here.
- Besides schemas, shared may hold **pure functions that both apps use** (e.g. `noteBasename`, `groupParagraphs`): no I/O, no dependencies beyond Zod (and `yaml` for notes, ADR 0021), no Express or React, each with its own tests here.
- If only one app uses a function, it stays in that app.
- Every schema is exported as a value, and its type with the same name via `z.infer`.
- JSON field names on the wire are snake_case (`job_id`, `created_at`).
- Changing a schema is a contract change: stop and ask unless the TRD or the task covers it.
