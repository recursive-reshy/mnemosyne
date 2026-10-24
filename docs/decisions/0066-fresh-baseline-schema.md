# 0066. A fresh baseline schema; old databases set aside

- Status: Proposed
- Date: 2026-10-24

## Context
Giving every table an owner (ADR 0062) in SQLite means rebuilding all 22 tables. Naresh has little data: his notes are files in the vault, and he is willing to re-add feeds, reconnect Gmail, re-enter prompt edits and re-enroll Melete notes.

## Decision
- **Migrations 1–9 collapse into one baseline** that creates the 0.9 schema directly, at schema version 10 (`SCHEMA_BASE = 9`). It seeds nothing (ADR 0065).
- **A database at schema 1–9 is set aside:** copied with `VACUUM INTO` to the backups folder as `pre-0.9-<timestamp>.db`, then deleted with its WAL and shared-memory files, and the app starts empty. If the copy fails, the app refuses to start and deletes nothing.
- **Before any later migration**, a `VACUUM INTO` backup named `pre-migration-v<from>-to-v<to>-<timestamp>.db`; if it fails, the app refuses to start.
- After migrating, `PRAGMA foreign_key_check` must report nothing.
- During 0.9 development the baseline itself is edited task by task; it is fixed at release.

## Consequences
- No table rebuilds, no data copying, no v9 fixture database to maintain.
- Naresh loses database-only data: feeds, Gmail connection, prompt edits, Melete enrollment and history, usage history and unsaved drafts. The set-aside copy keeps it readable in any SQLite tool.
- Every future migration gets an automatic backup.

## Alternatives considered
- **Migration 10 rebuilding every table and assigning rows to the admin:** keeps the data, at the cost of the largest and riskiest task in the increment.
- **Refuse to start on an old database and ask Naresh to move it:** safer in theory, but the automatic copy already guarantees nothing is lost.
