# Mnemosyne

Paste a video URL (YouTube or anything yt-dlp supports) and get a timestamped transcript as Markdown (ready for Obsidian), SRT or TXT. It runs on your Mac; nothing leaves the machine except the video download.

## How it works

You submit a URL in the browser. The Express server queues a job, and a worker runs one job at a time: yt-dlp downloads the audio, ffmpeg converts it to 16 kHz mono WAV, and the WAV is sent over HTTP to whisper-server. The transcript is stored in memory and rendered to Markdown, SRT or TXT when you download it. The browser polls the job's status.

```text
browser ──> Express + worker (Docker, :3100)
                │
                ├─ yt-dlp   download audio
                ├─ ffmpeg   convert to WAV
                └─ whisper-server (native on the Mac, Metal GPU, :8178)
                        │
                        v
              transcript ──> Markdown / SRT / TXT downloads
```

## Requirements

- macOS on Apple Silicon
- Docker Desktop
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

2. Start the app:

   ```sh
   docker compose up -d --build
   curl http://localhost:3100/api/health
   ```

3. Open <http://localhost:3100>.

## Using it

1. Paste a video URL and submit.
2. Watch the stages: queued, downloading, converting, transcribing, done.
3. Download the transcript as Markdown, SRT or TXT.

The page address carries the job (`?job=<id>`), so refreshing the page keeps you on the same job. Jobs are kept in memory only: restarting the container forgets them, so download what you need first.

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
| `WHISPER_MODEL` | `large-v3-turbo` | `${WHISPER_MODEL:-large-v3-turbo}` |
| `WEB_DIR` | unset (Vite serves the web app) | `/app/web` |

- `WORK_DIR` holds audio files while a job runs; the folder is emptied when the server starts.
- `WHISPER_MODEL` is only the label stored on each transcript (whisper-server doesn't report its model). Keep it in step with the model the agent runs.
- `WEB_DIR` is the folder with the built web app; when set, Express serves it.
- For development, copy `apps/server/.env.example` to `apps/server/.env`. The file is optional, and `pnpm dev` loads it when present.

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

Stop the container first (`docker compose stop`): the dev server and the container both use port 3100. Open <http://localhost:5173> while developing. The integration tests need whisper-server running.

Layout: `apps/server` (Express API, worker, tool clients, formatters), `apps/web` (React UI), `packages/shared` (Zod schemas used by both), `ops/` (launchd plist and entrypoint).

## Stopping

```sh
docker compose stop
```

On a stop signal the server stops taking work and lets a running job finish, for up to 60 seconds, then exits. Docker allows 75 seconds before it kills the container. A second signal exits immediately: press Ctrl+C twice under `pnpm dev`, or run `docker compose kill` for the container. A killed job is lost.

## Troubleshooting

- **Jobs fail at transcribing, but the container shows healthy.** The health check only covers the server, not whisper-server. Check the agent with `launchctl print gui/$(id -u)/com.naresh.whisper-server` and `curl http://127.0.0.1:8178`, and read `~/Library/Logs/whisper-server.log`.
- **whisper-server isn't reachable from the container.** The container reaches it at `host.docker.internal:8178`, and the agent listens on `127.0.0.1`, which works through Docker Desktop. If `curl http://127.0.0.1:8178` fails on the Mac, the agent isn't running.
- **Port 3100 is already in use.** The container and `pnpm dev` use the same port. Run `docker compose stop` before `pnpm dev`, or stop the dev server before `docker compose up`.
- **A YouTube video fails with HTTP 403.** The server retries once after three seconds. If it still fails, submit the URL again later. The container updates yt-dlp each time it starts, so `docker compose restart` can also help.

## Status and roadmap

Version 0.1.0. A single-user tool: one job at a time, jobs held in memory, no accounts.

Possible next steps:

- Write transcripts straight into an Obsidian vault.
- Summarise transcripts.
- Live progress with Server-Sent Events instead of polling.
