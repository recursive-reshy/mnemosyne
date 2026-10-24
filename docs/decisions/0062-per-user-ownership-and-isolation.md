# 0062. Every row has an owner; isolation in the repositories

- Status: Accepted
- Date: 2026-10-24

## Context
Every table assumes one user. With two users, a forgotten filter leaks one person's notes, inbox or study history to the other. There is almost no data yet, so this is the cheapest time to change the data model.

## Decision
- **`user_id` on every data table**, child tables included, `NOT NULL REFERENCES users ( id ) ON DELETE CASCADE`. Unique constraints and list indexes become per user.
- **Foreign keys are enforced** (`PRAGMA foreign_keys = ON`), which they weren't before.
- **Every repository function takes `userId` first**, with no default. Controllers pass the signed-in user; background code passes the row's owner.
- **Another user's resource is a 404**, the same as an unknown ID; so is a route of a module the user doesn't have, and an admin route for a member.
- The only cross-user queries are in `repositories/system.repository.ts`, used by the background loops (ADR 0064).
- Guards: a schema test (every table has the column), a signature test (every repository function's first parameter is `userId`), two-user isolation tests per repository and per router.
- Exceptions: `users`, `user_modules`, `sessions`, `app_settings`; `health_status` and `health_errors` have a nullable `user_id` for app-level checks (ADR 0065).

## Consequences
- One uniform rule (`WHERE user_id = ?`) is easy to review and hard to forget, and TypeScript finds every call site.
- Deleting a user is one statement.
- Owner IDs are repeated on child rows; the cost is negligible.
- Turning on foreign keys may expose existing delete-order bugs; the test suite finds them in this increment.

## Alternatives considered
- **`user_id` on top-level tables only, children inherit through joins:** every child query needs a join to prove ownership, which is the easiest filter to forget.
- **A database file per user:** isolation for free, but cross-user work (the loops, usage totals, admin) becomes fan-out across files.
- **Row-level security:** SQLite has none.
