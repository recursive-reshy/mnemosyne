# 0065. Per-user settings, app settings, per-user seeding, split health

- Status: Proposed
- Date: 2026-10-24

## Context
The `settings` key/value table mixes personal choices (default model, learning root, review mode, seed markers) with app-wide ones (feed check interval). Prompt profiles are seeded by migrations. `health_status` mixes app services with a user's own sources.

## Decision
- `settings` becomes per user, keyed `( user_id, key )`; a new `app_settings ( key, value )` holds app-wide values. The keys are two Zod enums (`UserSettingKey`, `AppSettingKey`) so a key can't be written to the wrong table.
- **`seedUser( userId )`** copies the seeded prompt profiles (summary profiles including Study, the linker, Melete questions and grading) and writes the seed markers when a user is created. Locked instructions stay in code and are shared.
- `health_status` and `health_errors` carry a nullable `user_id`, null exactly for app kinds (agent, whisper, backup), enforced by a `CHECK`. `GET /api/status` returns the caller's own sources and, for the admin, app services; the drawer badge counts what the user can see.
- App-wide settings, app-service status and **Back up now** are admin-only.

## Consequences
- Each user edits their own prompts and models without affecting the other.
- A member never sees warnings about services they can't fix.
- Seeding no longer lives in migrations, so the fresh baseline (ADR 0066) stays structure-only.

## Alternatives considered
- **Shared prompt profiles:** one user's edit changes the other's summaries.
- **A per-user `health_status` copy of app checks:** duplicates checks that have one true answer.
