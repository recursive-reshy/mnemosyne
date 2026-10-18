# Mnemosyne

Paste a video URL (YouTube or anything yt-dlp supports) and get a timestamped transcript, or paste an article URL, and get a Claude-written summary that you review and save as a note in your Obsidian vault. You can also subscribe to RSS or Atom feeds and pick which new posts to summarize. It runs on your Mac; the video download, the pages and feeds the server fetches, and the transcript or article text sent to the Claude API for the summary are the only things that leave the machine.

## How it works

You submit a URL in the browser; it is a video or an article, detected from the host and overridable. The Express server queues a job, and a worker runs one job at a time through a source adapter. For a video, yt-dlp downloads the audio, ffmpeg converts it to 16 kHz mono WAV, and the WAV is sent over HTTP to whisper-server. The transcript is stored in a SQLite database and rendered to Markdown, SRT or TXT when you download it. For an article, the server fetches the page itself, extracts the main text and stores it as Markdown; a page it can't read (a login or a paywall) is handled by pasting the article's text. The worker then sends the transcript or article to the Claude API for a summary (key points, quotes, tags; article notes have no timestamps), using the prompt profile and model you picked in Settings or for that video. You review the note in the browser, where every edit is saved to the server as a draft, pick the vault folder it goes to, and saving writes it there and deletes the transcript or article. Feeds: you subscribe in Settings, the server checks them on a schedule, and new items wait in a From feeds inbox on the home page; nothing is fetched or summarized until you summarize an item (or switch a feed to summarize automatically). Jobs you leave in review are deleted after 24 hours; every edit starts the 24 hours again. The browser polls the job's status.

```text
browser ──> Express + worker (Docker, :3100)
                │
                ├─ fetch articles and feeds (Readability, feedsmith)
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

The web browser tests (`pnpm --filter web test:browser`) run in real Chromium and WebKit. Install them once:

```sh
pnpm --filter web exec playwright install chromium webkit
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

1. Paste a video or article URL and submit. Under the field a **Video / Article** switch shows what was detected; click it to override. The button reads Transcribe for a video and Summarize for an article. **Paste text instead** (for articles) takes the article's text with an optional title, and nothing is fetched. Below the field, **Prompt profile** and **Model** start on your defaults (see Settings below); change them to use another for this video only.
2. Watch the stages: for a video queued, downloading, converting, transcribing, summarizing, ready for review; for an article queued, fetching, summarizing, ready for review. If the page can't be read the job fails with the reason and **Paste text**, which continues the same job with the text you paste.
3. Download the transcript as Markdown, SRT or TXT while a video job is in review (an article offers Markdown only).
4. Review the note. It opens in a rendered editor with a properties panel (title and tags). A toolbar above the note formats it: undo and redo, block type (paragraph, heading 1 to 3, quote), bold, italic, bulleted and numbered lists, and links. It writes plain Markdown (`#`–`###`, `>`, `**bold**`, `*italic*`, `-`, `1.`, `[text](url)`), so Obsidian reads the note as expected. Switch to source mode to see and edit the raw Markdown, front-matter included; the formatting buttons are hidden there. The transcript (or, for an article, its text) sits beside it; clicking a timestamp in the note, or moving the cursor onto one, scrolls the transcript there.
5. Choose where the note goes with **Change folder**: filter the vault's folders (hidden folders are not shown), pick one, or type a new folder name under the chosen folder. A new folder is created only when you save. Without a choice the note goes to `DEFAULT_NOTE_FOLDER`.
6. **Save to vault** writes the note and deletes the transcript, or **Discard** deletes the job.
7. Under the note a line shows how the summary was made: the model, the prompt profile and its version, the tokens in and out, and an estimated cost (for example `Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12`). If the summary was made more than once it also gives the number of attempts and the total. The cost is an estimate from a price table in the app, marked with `~`; a model that isn't in the table shows tokens only. The record is kept in the database even after you save or discard the job.
8. **Regenerate summary** runs the summary again on the same transcript, with the profile and model you choose in a dialog (they start on what the job used). It replaces the current note, including your edits, and keeps the vault folder. Use it to compare prompts or models on a real video.

### Settings

The gear at the bottom of the navigation drawer opens **Settings**. The Summarizer section has:

- **Default model and default prompt profile.** They save as soon as you change them. The model list comes from Anthropic, so new models appear without an update, and only models that can produce the structured summary are listed. If Anthropic can't be reached the list shows just the current default and says it is offline. The submit form and the Regenerate dialog can pick another profile or model for one video.
- **Prompt profiles.** A profile is a named prompt (up to 20,000 characters) that tells Claude what to pull out of a video. Three ship with the app: **Business ideas** (the default, aimed at validating ideas), **Coding** and **General** (the 0.3 summary). You can create, rename and delete profiles (the default and the last remaining one can't be deleted). Edit a prompt and **Save** to store it as a new version; unsaved changes are marked, and switching profile or closing the tab asks first. A changed prompt applies to summaries that start after you save; notes already in review keep what they have.
- **History.** Every save is a numbered version. Open any version to read it, and **Restore this version** saves a copy of it as the newest. **Reset to default** does the same with the shipped text, for the profiles that ship.
- **Instructions the app always sends.** Read-only views (one for videos, one for articles) of the fixed part of the prompt that keeps the output in the shape the app needs. Your prompt is added after it, so no edit can break the note.

- **Feeds.** Set how often feeds are checked (15 minutes to daily), **Check all now**, and **Add feed**: enter a feed address or a page that links to one, see its title and latest item, pick its prompt profile and whether it summarizes automatically. Each feed has an on/off switch, an automatic switch and a menu (Check now, Edit, Delete). Adding a feed doesn't import its back catalogue: only its newest item goes to the inbox. A check adds at most 10 new items per feed; the rest are marked seen and skipped, and the feed says how many. A failing feed shows its error and keeps being retried.
- **From feeds.** On the home page, new items wait here with their feed, title and date. **Summarize** (one item or a selection) turns them into normal jobs with the feed's profile, or one you choose for the batch, and the model you choose; **Dismiss** removes them. Items don't expire; the jobs made from them follow the usual 24-hour review expiry and show the feed's name.

The app opens with a navigation drawer on the left (**Transcriber**, with **Settings** and the colour-mode control at the bottom). The hamburger in the top bar collapses it to icons or expands it again, and the choice is remembered in the browser. On a narrow window the drawer is hidden and opens over the page. At the bottom of the drawer, **Light**, **Dark** and **System** set the colour mode (System follows the OS and is the default); that choice is remembered too. The note editor follows the colour mode too.

Edits are saved to the server about a second and a half after you stop typing, when you switch editor mode, leave the editor or choose a folder, and before saving, so a refresh, a crash or another browser shows your latest draft. The status line under the editor reads Saved, Saving… or Not saved, with the reason.

The page address carries the job (`?job=<id>`), so refreshing the page keeps you on the same job. Jobs and their transcripts live in a SQLite database on a Docker volume, so they survive a container restart or rebuild. A job that was downloading, converting or transcribing when the app stopped is marked failed on the next start.

The API also supports listing jobs, listing the vault's folders, updating a review draft, saving it, retrying a failed summary and discarding a job (`GET /api/jobs`, `GET /api/vault/folders`, `PATCH /api/jobs/:id/draft`, `POST /api/jobs/:id/save` with no body, `POST /api/jobs/:id/retry-summary`, `DELETE /api/jobs/:id`). Settings and summaries add `GET` and `PATCH /api/settings`, `GET /api/models`, the prompt profile endpoints under `/api/prompt-profiles` (list, create, rename, delete, versions, restore, reset), `POST /api/jobs/:id/regenerate-summary`, and optional `model` and `profile_id` in the `POST /api/jobs` body. Version 0.5.0 adds `source_type`, `text` and `title` to the `POST /api/jobs` body, `GET /api/jobs/:id/source` (replacing `/transcript`), `POST /api/jobs/:id/text` (pasted text for a failed article job), the feed endpoints (`GET` and `POST /api/feeds`, `POST /api/feeds/preview`, `POST /api/feeds/check`, `PATCH` and `DELETE /api/feeds/:id`, `POST /api/feeds/:id/check`) and the inbox endpoints (`GET /api/feed-items`, `POST /api/feed-items/summarize`, `POST /api/feed-items/dismiss`).

## Output formats

- **Markdown:** frontmatter with `title`, `source`, `channel`, `duration`, `transcribed`, `model` and `tags`, then paragraphs that each start with a timestamp. For YouTube videos the timestamp links to that moment in the video.
- **Article notes:** the same sections, with `author`, `site` and `published` (each only when known) in the front-matter instead of `channel` and `duration`, and no timestamps. Articles have no SRT or TXT.
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
pnpm --filter web test:browser                  # real-browser tests (Chromium and WebKit)
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
- **An article job fails with "needs a login or is paywalled" or "Not an article page".** The server fetches pages without logging in or running scripts. Use **Paste text** on the failed job and paste the article's text.
- **A feed shows a warning.** Its last check failed (the message says why, for example the site answered 500). It is retried at the normal interval; **Check now** in its menu retries at once.
- **A YouTube video fails with HTTP 403.** The server retries once after three seconds. If it still fails, submit the URL again later. The container updates yt-dlp each time it starts, so `docker compose restart` can also help.

## Status and roadmap

Version 0.5.0. A single-user tool: one job at a time, jobs kept in SQLite, no accounts.

Possible next steps:

- A Gmail adapter for email newsletters and freelance-job alerts (the source adapters are built for it).
- OPML import and export of feeds, and a per-feed model.
- Lazy-load the note editor (the web bundle is about 1.5 MB).
- A spend summary (per month, per model) built on the recorded usage.
- Add `[[wikilinks]]` to related notes with an agent that knows the vault.
- Remember the last-used folder, or pick a folder by tag.
- Live progress with Server-Sent Events instead of polling.
- Query past notes through an MCP server.
