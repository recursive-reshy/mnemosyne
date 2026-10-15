# Checkpoint F plan: Phase 8 (verification)

## Context
Checkpoints A–E built everything in the 0.2.0 PRD. What is left is proof that it works as a whole on Naresh's Mac, and the release housekeeping. I can't do the proof alone: it needs a real 1–2 hour video, a Claude API key, the Docker container (replacing the 0.1.0 one on :3100) and the real Obsidian vault. So 8.1 is a checklist that Naresh runs, with me preparing and watching, and 8.2 is a small change I make after it passes. No ADRs apply.

## Points to confirm
1. **8.1 is only ticked once you tell me the results.** I'll write the checklist below into this plan's saved copy (`docs/v0.2.0/plans/checkpoint-f.md`, not a new doc) and, when you have run it, record each outcome in the `tasks.md` log. Anything that fails becomes a fix in a new commit (or a note under "deferred"), not a silent pass.
2. **I'll replace your running 0.1.0 container only when you say so.** The checklist starts with `docker compose up -d --build`, which stops and replaces the `mnemosyne` container on :3100. Nothing else in Docker is touched.
3. **8.2 also fixes stale README text I left behind**: `?job=<id>` (now `/jobs/:id`), "the review screen comes in a later checkpoint", and the "Version 0.1.0 … held in memory" footer. These are doc fixes in the same commit as the version bump.
4. **Version bump scope:** the four `package.json` files (root, `apps/server`, `apps/web`, `packages/shared`) go from `0.1.0` to `0.2.0`. No git tag unless you ask.

## Tasks

### 8.1 Manual checklist with Naresh
Preparation I can do now (before you start), with results reported to you:
- `pnpm test`, `lint`, `typecheck`, `build` at the root, all green.
- `docker compose config` parses with your `.env`; `docker build` of the image succeeds.

What you run (each step ends with what to look for; tell me pass or fail and anything odd):
1. **Setup.** Root `.env` has `ANTHROPIC_API_KEY` and `VAULT_HOST_PATH` (your vault folder). `docker compose up -d --build`; `docker compose ps` shows healthy; whisper-server answers on `127.0.0.1:8178`. Open <http://localhost:3100>.
2. **Real video → note.** Submit a 1–2 hour YouTube talk. Watch the home list and the job page go through queued → downloading → converting → transcribing → summarizing → ready for review (leaving the tab and coming back is fine). Look for: summary, key points and quotes with working timestamps; suggested tags (3–5, lowercase, hyphenated); the title; the filename preview.
3. **Review.** Put the caret on a timestamp line in the summary: the transcript pane scrolls and marks that paragraph. Edit the title, tags and summary. Refresh the page: the edits come back.
4. **Save.** Click Save to vault. You land on the home page with "Saved to Mnemosyne/<title>.md". Open the note in Obsidian: frontmatter (`title`, `source`, `channel`, `duration`, `created`, `tags` starting with `mnemosyne`), body, timestamp links jump to the video. The job has left the list; its transcript download is no longer possible.
5. **Restart mid-review.** Submit a second (short) video and wait for ready-for-review. `docker compose restart`. The job is still there, with its summary and transcript, and the expiry countdown continues.
6. **Filename collision.** Save a second job with the same title as an existing note: the new file is `Title (2).md` and the first is untouched.
7. **Discard.** Discard a job from review: it disappears from the list at once; its URL shows "no longer exists"; its draft is gone.
8. **Summary failure and retry.** Stop the container's network access to Claude or use a bad key to force `summary_failed` (or tell me to simulate it), confirm the reason shows, transcript and downloads remain, then Retry summary succeeds once the key or network is fixed.
9. **Expiry.** Recreate the container with `REVIEW_TTL_HOURS=0.01` and `CLEANUP_INTERVAL_MINUTES=1` (about 36 s and one minute), leave a job in review: it is deleted within a couple of minutes and the list updates. Put the settings back afterwards.
10. **Interrupted job.** Start a job and restart the container while it is downloading or transcribing: after restart it shows as failed ("Interrupted by restart"); a job restarted while summarizing resumes.

I'll record pass/fail per step in the `tasks.md` log, and tick 8.1 when all pass or each failure has a decision.

### 8.2 Version bump and README
- Files: root `package.json`, `apps/server/package.json`, `apps/web/package.json`, `packages/shared/package.json` (`"version": "0.2.0"`), `README.md`, `docs/v0.2.0/tasks.md`.
- Tests first: there is no behaviour to test. The guard is a check run before and after: `grep` for `"version"` shows `0.2.0` in all four files and no `0.1.0` remains in tracked non-doc files; the full test/lint/typecheck/build run stays green.
- README: usage section describes review → edit → save/discard/retry with the `/jobs/:id` address; remove the "later checkpoint" sentence; fix the footer (version 0.2.0, jobs in SQLite on a volume, single user).

## Verification
- 8.1: the checklist above, run by Naresh, plus my pre-flight results.
- 8.2: root `pnpm test`, `lint`, `typecheck`, `build` after the bump; `git grep` for leftover `0.1.0` outside historical docs.
- Report: per-step checklist results, anything deferred or worth a follow-up, commit hashes, and per-folder results.
