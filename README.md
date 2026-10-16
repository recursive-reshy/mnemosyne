# Mnemosyne

Paste a video URL (YouTube or anything yt-dlp supports) and get a timestamped transcript, plus a Claude-written summary that you review and save as a note in your Obsidian vault. It runs on your Mac; the video download and the transcript text sent to the Claude API for the summary are the only things that leave the machine.

## How it works

You submit a URL in the browser. The Express server queues a job, and a worker runs one job at a time: yt-dlp downloads the audio, ffmpeg converts it to 16 kHz mono WAV, and the WAV is sent over HTTP to whisper-server. The transcript is stored in a SQLite database and rendered to Markdown, SRT or TXT when you download it. The worker then sends the transcript to the Claude API for a summary (key points, quotes, tags). You review the note in the browser, where every edit is saved to the server as a draft, pick the vault folder it goes to, and saving writes it there and deletes the transcript. Jobs you leave in review are deleted after 24 hours; every edit starts the 24 hours again. The browser polls the job's status.

```text
browser ──> Express + worker (Docker, :3100)
                │
                ├─ yt-dlp   download audio
                ├─ ffmpeg   convert to WAV
                ├─ whisper-server (native on the Mac, Metal GPU, :8178)
                ├─ Claude API   summarize the transcript
                └─ vault folder  save the reviewed note (bind mount)
                        │
                        v
         transcript ──> downloads; summary ──> Obsidian note
```

## Requirements

- macOS on Apple Silicon
- Docker Desktop
- An Anthropic API key (summaries cost a small amount per video)
- An Obsidian vault folder on this Mac
- Homebrew `whisper-cpp`, which provides `whisper-server`:
  ```sh
  brew install whisper-cpp
  ```
- Two model files in `~/whisper-models/`:
  - `ggml-large-v3-turbo-q5_0.bin` from [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin)
  - `ggml-silero-v5.1.2.bin` (voice activity detection) from [ggml-org/whisper-vad](https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin)

For development you also need Node 24, pnpm (the version in `packageManager` in `package.json`), and `yt-dlp` and `ffmpeg` from Homebrew:

```sh
brew install yt-dlp ffmpeg
```

## Setup

1. Run whisper-server as a login agent. `ops/com.naresh.whisper-server.plist` hard-codes `/Users/naresh/...` paths for the models and the log file; edit them to match your home folder first. Then:

   ```sh
   cp ops/com.naresh.whisper-server.plist ~/Library/LaunchAgents/
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.naresh.whisper-server.plist
   curl http://127.0.0.1:8178
   ```

   Logs are in `~/Library/Logs/whisper-server.log`. `ops/README.md` has the check, stop and remove commands.

2. Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY` and `VAULT_HOST_PATH` (the absolute path of your vault). Then start the app:

   ```sh
   docker compose up -d --build
   curl http://localhost:3100/api/health
   ```

3. Open <http://localhost:3100>.

## Using it

1. Paste a video URL and submit.
2. Watch the stages: queued, downloading, converting, transcribing, summarizing, ready for review.
3. Download the transcript as Markdown, SRT or TXT while the job is in review.
4. Review the note. It opens in a rendered editor with a properties panel (title and tags); switch to source mode to see and edit the raw Markdown, front-matter included. The transcript sits beside it.
5. Choose where the note goes with **Change folder**: filter the vault's folders (hidden folders are not shown), pick one, or type a new folder name under the chosen folder. A new folder is created only when you save. Without a choice the note goes to `DEFAULT_NOTE_FOLDER`.
6. **Save to vault** writes the note and deletes the transcript, or **Discard** deletes the job.

Edits are saved to the server about a second and a half after you stop typing, when you switch editor mode, leave the editor or choose a folder, and before saving, so a refresh, a crash or another browser shows your latest draft. The status line under the editor reads Saved, Saving… or Not saved, with the reason.

The page address carries the job (`?job=<id>`), so refreshing the page keeps you on the same job. Jobs and their transcripts live in a SQLite database on a Docker volume, so they survive a container restart or rebuild. A job that was downloading, converting or transcribing when the app stopped is marked failed on the next start.

The API also supports listing jobs, listing the vault's folders, updating a review draft, saving it, retrying a failed summary and discarding a job (`GET /api/jobs`, `GET /api/vault/folders`, `PATCH /api/jobs/:id/draft`, `POST /api/jobs/:id/save` with no body, `POST /api/jobs/:id/retry-summary`, `DELETE /api/jobs/:id`).

## Output formats

- **Markdown:** frontmatter with `title`, `source`, `channel`, `duration`, `transcribed`, `model` and `tags`, then paragraphs that each start with a timestamp. For YouTube videos the timestamp links to that moment in the video.
- **SRT:** subtitle file, one cue per segment.
- **TXT:** plain text with no timestamps.

## Configuration

The server reads these environment variables. Empty values count as unset.

| Variable | Default | Docker (`docker-compose.yml`, Dockerfile) |
| --- | --- | --- |
| `PORT` | `3100` | `3100` |
| `WHISPER_URL` | `http://localhost:8178` | `http://host.docker.internal:8178` |
| `WORK_DIR` | `<OS temp dir>/mnemosyne` | `/tmp/mnemosyne` |
| `DATA_DIR` | `<OS temp dir>/mnemosyne-data` | `/data` (volume `mnemosyne-data`) |
| `VAULT_PATH` | required | `/vault` (bind mount of `VAULT_HOST_PATH`) |
| `DEFAULT_NOTE_FOLDER` | `Mnemosyne` | from `.env`, default `Mnemosyne` |
| `ANTHROPIC_API_KEY` | required | from `.env` |
| `SUMMARY_TIMEOUT_MS` | `300000` | default |
| `REVIEW_TTL_HOURS` | `24` | default |
| `CLEANUP_INTERVAL_MINUTES` | `15` | default |
| `WHISPER_MODEL` | `large-v3-turbo` | `${WHISPER_MODEL:-large-v3-turbo}` |
| `WEB_DIR` | unset (Vite serves the web app) | `/app/web` |

- `WORK_DIR` holds audio files while a job runs; the folder is emptied when the server starts.
- `WHISPER_MODEL` is only the label stored on each transcript (whisper-server doesn't report its model). Keep it in step with the model the agent runs.
- `WEB_DIR` is the folder with the built web app; when set, Express serves it.
- `DATA_DIR` holds `mnemosyne.db`. `VAULT_PATH` must exist and be writable at startup, or the server exits with a message.
- `DEFAULT_NOTE_FOLDER` is the vault folder notes go to unless you pick another in the review screen. It is relative to the vault, is created at startup if missing, and must be a plain path such as `Notes/Videos` (no `..`, no leading `/`, no folder starting with a dot). The server never writes outside the vault, whatever folder is asked for.
- `ANTHROPIC_API_KEY` lives in `.env` only, never in the repo. In Docker, `.env` at the repo root feeds both compose and the container.
- For development, copy `apps/server/.env.example` to `apps/server/.env` and set `ANTHROPIC_API_KEY` and `VAULT_PATH` (any folder works for trying it out). `pnpm dev` loads it, and the integration tests load it too.

## Development

```sh
pnpm install
pnpm dev                                        # server on :3100, web on :5173 (proxies /api)
pnpm test                                       # unit tests, all packages
pnpm --filter @mnemosyne/server test:integration  # real yt-dlp, ffmpeg and whisper-server
pnpm lint
pnpm typecheck
pnpm build
```

Stop the container first (`docker compose stop`): the dev server and the container both use port 3100. Open <http://localhost:5173> while developing. The integration tests need whisper-server running; the Claude integration test also needs `ANTHROPIC_API_KEY` and is skipped without it.

Layout: `apps/server` (Express API, worker, tool clients, formatters), `apps/web` (React UI), `packages/shared` (Zod schemas used by both), `ops/` (launchd plist and entrypoint).

## Stopping

```sh
docker compose stop
```

On a stop signal the server stops taking work and lets a running job finish, for up to 60 seconds, then exits. Docker allows 75 seconds before it kills the container. A second signal exits immediately: press Ctrl+C twice under `pnpm dev`, or run `docker compose kill` for the container. A killed job that was mid-transcription is marked failed on the next start; a job that was summarizing is resumed.

## Troubleshooting

- **Jobs fail at transcribing, but the container shows healthy.** The health check only covers the server, not whisper-server. Check the agent with `launchctl print gui/$(id -u)/com.naresh.whisper-server` and `curl http://127.0.0.1:8178`, and read `~/Library/Logs/whisper-server.log`.
- **whisper-server isn't reachable from the container.** The container reaches it at `host.docker.internal:8178`, and the agent listens on `127.0.0.1`, which works through Docker Desktop. If `curl http://127.0.0.1:8178` fails on the Mac, the agent isn't running.
- **Port 3100 is already in use.** The container and `pnpm dev` use the same port. Run `docker compose stop` before `pnpm dev`, or stop the dev server before `docker compose up`.
- **The server exits at startup with a `VAULT_PATH` message.** The vault folder is missing or not writable. In Docker, check `VAULT_HOST_PATH` in `.env` points at an existing folder that Docker Desktop is allowed to share.
- **A job shows "summary failed".** The transcript is kept; the reason is on the job (`GET /api/jobs/:id`). Retry with `POST /api/jobs/:id/retry-summary`.
- **A YouTube video fails with HTTP 403.** The server retries once after three seconds. If it still fails, submit the URL again later. The container updates yt-dlp each time it starts, so `docker compose restart` can also help.

## Status and roadmap

Version 0.1.0. A single-user tool: one job at a time, jobs held in memory, no accounts.

Possible next steps:

- Write transcripts straight into an Obsidian vault.
- Summarise transcripts.
- Live progress with Server-Sent Events instead of polling.
