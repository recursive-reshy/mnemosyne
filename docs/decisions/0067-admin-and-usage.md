# 0067. Admin routes and a usage rollup

- Status: Accepted
- Date: 2026-10-24

## Context
Naresh is the admin. He adds his brother, chooses his modules, can remove him, and wants to see what his brother's usage costs, but not his content. Four run tables already store tokens and estimated cost.

## Decision
- `/api/admin/*` behind `requireAdmin` (404 for members): list, add (with `seedUser`), update name, modules and status, reset vault, delete.
- **Remove** sets `status = 'removed'` and deletes the user's sessions; **Restore** sets it back with data intact. **Delete user** is allowed only for a removed user, requires typing their email, and is `DELETE FROM users` with cascading foreign keys. Vault folders are never touched.
- The admin can't remove, delete or change their own account through these routes.
- **Usage:** a `usage_events` view (`UNION ALL` of summary, link, Melete and extraction runs); per-user totals by category for a calendar month in `APP_TIME_ZONE` and for all time. Transcription is reported as audio minutes in 0.9 and gains a cost with the API adapter in 1.0.
- No route lets the admin read another user's jobs, notes, inbox, feeds, prompts or study data.

## Consequences
- Delete has no hand-maintained order to drift.
- Costs are the estimates already stored; no recalculation.

## Alternatives considered
- **Keep the user row after deleting data:** an empty account serves no purpose.
- **Spend caps or model restrictions:** not needed for two people; KIV.
