# 0010. TypeScript 6 until typescript-eslint supports TypeScript 7

- Status: Accepted
- Date: 2026-10-14

## Context
The server was set up on TypeScript 7.0. typescript-eslint, which ESLint needs to parse TypeScript at all, only supports TypeScript below 6.1 and fails outright on 7.0. Without it, ESLint can't lint `.ts` files, so the check-only style enforcement in ADR 0009 would not work.

## Decision
Use **TypeScript 6.0.x** across the monorepo until typescript-eslint supports TypeScript 7.

## Consequences
- ESLint, typescript-eslint and `tsc` run on one supported, fully compatible TypeScript version.
- TypeScript 7's main gain is a much faster compiler. At this project's size the difference is seconds at most.
- The language and `tsconfig` options used here (`erasableSyntaxOnly`, `nodenext`, `customConditions`) are the same in 6.0.
- Moving to TypeScript 7 later is a version bump plus a lint run, recorded in a new ADR.

## Alternatives considered
- **TypeScript 7 for `tsc` plus TypeScript 6 side by side for ESLint:** works, but two compilers can disagree, and it adds setup to maintain for little gain.
- **Drop typescript-eslint:** ESLint can't parse TypeScript without it, so the style rules couldn't be enforced at all.
- **Wait for TypeScript 7 support:** leaves lint blocked for an unknown time.
