# 0001. Monorepo with pnpm workspaces

- Status: Accepted
- Date: 2026-10-14

## Context
The app has an Express API and a React frontend that share a contract: job status, transcript segments and export formats. Keeping them in separate repos risks the types drifting apart.

## Decision
One repository using pnpm workspaces:

- `apps/server` — Express + TypeScript
- `apps/web` — React + TypeScript (Vite)
- `packages/shared` — types imported by both apps

No Turborepo or Nx; plain workspace scripts are enough at this size.

## Consequences
- Frontend and backend import the same types, so contract changes surface as type errors.
- One `pnpm dev` / `pnpm test` from the root runs everything.
- In development, Vite proxies `/api` to Express, avoiding CORS setup.

## Alternatives considered
- **Separate repos:** more overhead, duplicated types.
- **Turborepo/Nx:** caching and task graphs aren't worth the setup for two apps and one package. Revisit if build times hurt.
