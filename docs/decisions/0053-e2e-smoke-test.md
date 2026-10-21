# 0053. End-to-end smoke test: the real Compose stack against local fakes, driven by Playwright

- Status: Proposed
- Date: 2026-10-21

## Context
Each app has thorough unit and integration tests, but nothing runs the built images together: the web build served by Express, the worker, SQLite on a volume, the agent container, the vault mount and the Compose wiring. Seven feature releases in, a broken release would be found by hand.

## Decision
- A new workspace package `e2e/` with `@playwright/test` (Chromium only).
- A fakes container (Node built-ins only) serves an article, an RSS feed, a stand-in whisper `/health`, and a fake Anthropic API (`/v1/models`, `/v1/messages` answering the summarizer with a fixture summary and the linker with a submit tool call). Both Anthropic SDKs are pointed at it with `ANTHROPIC_BASE_URL`, so no app code changes.
- A Compose override adds the fakes and points the app and agent at them, under project `mnemosyne-e2e` on port 3101, with the vault and backups in temp folders, so it never touches Naresh's running instance or data.
- `pnpm e2e` builds and starts the stack, runs the tests, and always tears it down with its volume.
- Tests: article (submit, summarize, link, accept a link, save, file in the vault), feed (add, check, items in the inbox), status (no failures, Back up now writes a file).
- It runs at the end of each checkpoint and before a release, not per task.

## Consequences
- A release can be checked end to end with one command, offline.
- The fakes must follow the summarizer's structured output and the agent's submit tool; they answer 400 to anything unexpected so drift shows up loudly.
- Needs Docker running when a checkpoint ends.
- Video (yt-dlp, ffmpeg, Whisper) and Gmail are not covered.

## Alternatives considered
- **Playwright against `pnpm dev`:** faster, but skips the images and Compose wiring the test is meant to cover.
- **Recording real API responses:** brittle, and needs the network and a key.
- **A video path with a fake Whisper:** more coverage, but Naresh chose article and feed only.
