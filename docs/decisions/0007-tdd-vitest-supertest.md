# 0007. TDD with Vitest and Supertest

- Status: Accepted
- Date: 2026-10-14

## Context
The app is built in small slices, with Claude Code implementing each slice from a written handoff. A strict test-first loop keeps each slice verifiable and stops scope creep.

## Decision
- **Test-driven development for every change:** write a failing test, confirm it fails for the right reason, implement the minimum to pass, then refactor with tests green.
- **Vitest** as the test runner across all workspaces.
- **Supertest** for Express routes, testing the exported app instance (`app.ts`) without starting a real server.
- Tests live next to the code (`jobs.service.ts` → `jobs.service.test.ts`).
- **External tools are mocked with Vitest (`vi.mock`)**: service and worker tests mock the client modules; client tests mock `node:child_process` or `fetch`. No fake servers or injected runners.
- Integration tests against the real tools are named `*.integration.test.ts` and run only through a separate script, never in `pnpm test`.

## Consequences
- Each handoff has clear acceptance criteria: the tests.
- The Express app is built in `app.ts`, separate from `server.ts`, which calls `listen()`.
- Mocks are quick to write, but they only prove the code matches the mocked output. The integration tests are the check against the real tools, so they should be run after changes to a client.

## Alternatives considered
- **Jest:** works, but needs more config for TypeScript and ES modules than Vitest.
- **Fake servers and injected command runners:** test more real code, but add test-support code that isn't needed at this size.
- **Tests after implementation:** faster at first, but weaker guarantees and harder to review handoffs against.
