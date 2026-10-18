# CLAUDE.md — Mnemosyne (repo root)

Mnemosyne is a single-user, local-first app that turns a video URL (YouTube and anything else yt-dlp supports) into a timestamped Markdown transcript, ready for Obsidian. Later it may summarise transcripts and write notes straight into an Obsidian vault. It runs on Naresh's Mac: the app in one Docker container (with a data volume and the vault mounted), and whisper-server natively on the host.

This file holds only what is true everywhere. Each app has its own `CLAUDE.md` with its language, style and local rules, so read that one before working in the folder.

## Folders

| Folder | What it is |
| --- | --- |
| `apps/server` | Express API: jobs, worker, yt-dlp / ffmpeg / Whisper clients, formatters |
| `apps/web` | React UI (screens only) |
| `packages/shared` | Cross-app contracts: Zod schemas and their inferred types |
| `ops/` | launchd plist for the native whisper-server |
| `docs/` | Versioned plans in `docs/v<version>/` (PRD, TRD, tasks, checkpoint plans) and ADRs in `docs/decisions/`, indexed in `docs/README.md` |

## Architecture

The web app submits a URL to `POST /api/jobs`. The server queues a job and its worker runs it in the background, one at a time: yt-dlp downloads the audio and metadata, ffmpeg converts it to 16 kHz mono WAV, and the WAV is sent over HTTP to whisper-server on the host (reached through `WHISPER_URL`). The transcript is stored as metadata plus timestamped segments, and formatters render it as Markdown (default), SRT or TXT. The worker then sends the transcript to Claude for a summary (title, key points, quotes, tags). What the summary focuses on comes from a prompt profile, a named, versioned and editable guidance text that Naresh manages in Settings (the locked instructions that keep the output shape are always sent with it), and the model is chosen in Settings and can be overridden per video; both can be changed and the summary regenerated from the review screen. Every summary attempt is recorded with its model, prompt version, tokens and estimated cost. The note is stored as one Markdown string, front-matter included. Naresh reviews and edits it in the web app, which autosaves it to the server as a draft (each save restarts the 24-hour expiry), and chooses a vault folder for it; saving writes the stored draft into that folder of the Obsidian vault (a mounted folder, all writes confined to it) and deletes the transcript. Jobs are stored in SQLite, and unreviewed ones expire after 24 hours without an edit. The web app polls the job's status and offers the downloads.

The reasons behind each part are in `docs/decisions/`. Read the ADRs a task lists before starting.

## Workflow

Work is planned in versioned docs: `docs/v<version>/prd.md` (what and why), `trd.md` (how) and `tasks.md` (ordered tasks grouped into checkpoints). The current version is **0.5.0**. Only Naresh edits the PRD and TRD; `tasks.md` is the only planning doc you edit, and you also write ADRs and checkpoint plans.

At the start of every session:
1. Read `docs/v0.5.0/prd.md`, `trd.md` and `tasks.md`, and the ADRs listed against the next unticked task.
2. Say which checkpoint and task is next, in one line.
3. If that checkpoint's Plan cell is ⬜: enter plan mode and write one plan for every task in the checkpoint (files to touch, tests to write first, expected red → green path). Stop. When Naresh approves it, save it to `docs/v0.5.0/plans/checkpoint-<x>.md`, tick the Plan cell, commit, push, then start the first task.
4. If the Plan cell is ✅: read the saved plan and continue from the first unticked task.

Within a checkpoint, work through its tasks without stopping. For each task: failing tests first and watch them fail → least code to pass → refactor while green → tick Status and add a log line in `tasks.md` → commit → push. At the end of the checkpoint, stop and report (see "Before you stop").

If something isn't covered by the PRD, TRD, ADRs or the approved plan (a new dependency, endpoint, job status, contract change or folder), stop and ask. When Naresh decides, write the next-numbered ADR, add it to `docs/README.md` and to the task's ADR column, then continue.

## Precedence

1. An ADR listed in `tasks.md` overrides the TRD where they conflict, until Naresh updates the TRD. Mention it in the checkpoint report (e.g. "ADR 0019 changes TRD §8").
2. The TRD and ADRs override any `CLAUDE.md` description of the current architecture. When a task changes something a `CLAUDE.md` describes, update that `CLAUDE.md` in the same commit.
3. Any other conflict, or a doc that looks wrong: stop and ask. Don't pick one, and never edit the PRD or TRD.

## Rules that span apps

- **TDD, always.** Write the failing test first, run it and watch it fail for the right reason, write the least code that passes, then refactor while green. Each app's `CLAUDE.md` says how this runs there.
- **Contracts live in `packages/shared`** as Zod schemas, imported by package name (`@mnemosyne/shared`). Neither app redefines a shape the other one uses.
- **The server never spawns Whisper.** It calls whisper-server over HTTP at `WHISPER_URL`.
- **The stored transcript is the source of truth.** Markdown, SRT and TXT are rendered from it by pure formatters; Markdown is never stored as the canonical data.
- **No secrets in the repo.** Environment files stay out of git; `.env.example` lists the variable names only.
- **Don't add a dependency** unless the TRD or an ADR names it. Ask instead.

## Git

- Work on `main`. One commit per task, containing its code, tests and the `tasks.md` update. Push after every commit.
- Conventional messages with the task id: `feat(3.2): Claude client`, `refactor(6.1): useJob on TanStack Query`, `docs(plan): checkpoint B`.
- Stage files by name; never `git add -A` or `git add .`. Never commit `.env` or anything with a secret.
- Never `--amend`, rebase, force-push, `reset`, `stash`, `checkout -- <file>` or `restore`. If a commit is wrong, fix it in a new commit.
- If a push fails, stop and report it; don't try to resolve it.

## Before you stop

After each task, run the tests, lint and typecheck for every folder it touched; a task isn't ticked until all of them pass. At the end of a checkpoint, report:
- what was built, task by task, with commit hashes;
- test, lint and typecheck results per folder;
- any ADRs written and whether they change the TRD;
- anything deferred or worth a follow-up.
