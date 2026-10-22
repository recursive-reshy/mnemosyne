# 0054. Modules share the vault and own their data

- Status: Proposed
- Date: 2026-10-22

## Context
Mnemosyne is growing from one ingest pipeline into one web app with a module per job: Melete (a tutor) in 0.8.0, later a business-idea validator, a wealth tracker and a freelance-jobs CRM. These were agreed in October 2026 as a modular monolith in one monorepo, not separate services. No ADR records how modules share data, and Melete is the first module that needs the answer.

## Decision
- **One server, one web app, one SQLite database.** A module is a set of routes, services, repositories and screens inside the existing apps, with a name prefix (`melete*`) and its own drawer item.
- **Each module owns its tables** (`melete_*`). No other module reads or writes them directly; cross-module needs go through a service function.
- **Knowledge modules share the Obsidian vault read-only.** Only Mnemosyne's ingest pipeline writes to the vault (the save in `jobs.service.ts`). Melete reads notes and never writes, renames or annotates them.
- **Data modules don't touch the vault.** The wealth tracker and the freelance CRM keep everything in their own tables.
- **Shared pieces stay shared:** the vault path rules (`clients/vault.client.ts`), the Claude client, pricing, prompt profiles and their tables, settings, logging and the app shell.
- Mnemosyne's ingest code never imports a module.

## Consequences
- A module can be added or removed without touching the pipeline, and its tables can be dropped without migrating anyone else's.
- One process and one backup still cover everything (ADR 0051).
- Modules can't keep state in notes, so anything Melete learns about a note (enrollment, questions, schedules) lives only in the database. Losing the database loses study history, not notes.

## Alternatives considered
- **A separate app or service per module:** cleaner isolation, but a second deployment, database and auth story for a single user.
- **Modules writing front-matter** (for example a Melete id or due date in each note): makes notes portable, but turns every module into a vault writer, fights Obsidian Sync and breaks the single-writer rule.
