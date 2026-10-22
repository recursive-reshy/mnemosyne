# 0056. FSRS scheduling with ts-fsrs

- Status: Accepted
- Date: 2026-10-22

## Context
Melete repeats stored questions on a spaced-repetition schedule with four ratings (Again, Hard, Good, Easy). The two common algorithms are SM-2 (classic Anki) and FSRS (Anki's default since 2023).

## Decision
- **FSRS through `ts-fsrs`** (`^5.4.2`, MIT, the FSRS authors' TypeScript implementation, no runtime dependencies) in `apps/server`.
- Target recall `MELETE_REQUEST_RETENTION` (default 0.9), fuzz on, short-term learning steps on with the library's defaults.
- Each question stores the library's card fields as columns; every rating writes a `melete_reviews` row with the card state before it, which is what the FSRS optimizer needs.
- The scheduler is a pure function wrapped in `melete/scheduler.ts`; tests inject a no-fuzz instance.
- A day starts at `MELETE_DAY_START_HOUR` (default 4) in `APP_TIME_ZONE` (default `Asia/Singapore`), used for the new-questions-per-day limit only.
- Per-user parameter optimization and a Settings control for target recall are KIV.

## Consequences
- About 20–30% fewer reviews than SM-2 for the same retention, per published benchmarks, and no "ease hell".
- One new dependency, actively maintained.
- `elapsed_days` is deprecated in ts-fsrs 5 and isn't stored; a later major version may change the card shape and need a migration.

## Alternatives considered
- **SM-2 by hand:** no dependency and about 30 lines, but worse scheduling and its ease factor degrades with early lapses.
- **Fixed intervals (Leitner boxes):** simplest, poorest fit to memory.
