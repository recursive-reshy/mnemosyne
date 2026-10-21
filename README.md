# Mnemosyne

Paste a video URL (YouTube or anything yt-dlp supports) and get a timestamped transcript, or paste an article URL, and get a Claude-written summary that you review and save as a note in your Obsidian vault. You can also subscribe to RSS or Atom feeds, and connect Gmail (read-only) to pick up email newsletters, and choose which new items to summarize. It runs on your Mac; the video download, the pages and feeds the server fetches, the emails it reads from Gmail, and the transcript, article or email text sent to the Claude API for the summary are the only things that leave the machine.

## How it works

You submit a URL in the browser; it is a video or an article, detected from the host and overridable. The Express server queues a job, and a worker runs one job at a time through a source adapter. For a video, yt-dlp downloads the audio, ffmpeg converts it to 16 kHz mono WAV, and the WAV is sent over HTTP to whisper-server. The transcript is stored in a SQLite database and rendered to Markdown, SRT or TXT when you download it. For an article, the server fetches the page itself, extracts the main text and stores it as Markdown; a page it can't read (a login or a paywall) is handled by pasting the article's text. The worker then sends the transcript or article to the Claude API for a summary (key points, quotes, tags; article notes have no timestamps), using the prompt profile and model you picked in Settings or for that video. You review the note in the browser, where every edit is saved to the server as a draft, pick the vault folder it goes to, and saving writes it there and deletes the transcript or article. Feeds: you subscribe in Settings, the server checks them on a schedule, and new items wait in the Inbox on the home page; nothing is fetched or summarized until you summarize an item (or switch a feed to summarize automatically). Gmail: you connect your account once in Settings (read-only), add sources (Gmail labels or a Gmail search), and the server reads new matching emails on the same schedule; they wait in the same Inbox, and summarizing one turns the email body into an article job whose note links back to the email in Gmail. Linking: after the summary, the server asks a separate vault agent service (a small Python service in its own container, with the vault mounted read-only) which existing notes and concepts the new note should link to. The agent searches and reads the vault with Claude (Haiku by default) and returns suggestions; nothing is written to the vault by it. In review you accept or reject each link, and accepted links are inserted into the note's draft as `[[wikilinks]]`, so they land in the vault when you save. Jobs you leave in review are deleted after 24 hours; every edit starts the 24 hours again. The browser polls the job's status.

```text
browser ──> Express + worker (Docker, :3100)
                │
                ├─ fetch articles and feeds (Readability, feedsmith)
                ├─ Gmail API   read newsletters (read-only, optional)
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
- A shared secret for the vault agent service (`AGENT_SECRET`, see Setup)
- Optional, for Gmail newsletters: a Google account and a one-time Google Cloud setup ([below](#google-cloud-setup-for-gmail)). Without it the app works as before.
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

2. Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`, `VAULT_HOST_PATH` (the absolute path of your vault) and `AGENT_SECRET` (the secret the app and the vault agent service share; make one with `openssl rand -hex 32`). Compose refuses to start without it. Then start the app, which builds two images, the app and the agent:

   ```sh
   docker compose up -d --build
   curl http://localhost:3100/api/health
   ```

3. Open <http://localhost:3100>.

## Google Cloud setup for Gmail

Only needed to read Gmail. Mnemosyne asks Google for read-only access (`gmail.readonly`); it never changes your mailbox. The setup is done once, in the [Google Cloud console](https://console.cloud.google.com/). The console's menus change from time to time; the names below are those of the Google Auth Platform at the time of writing.

1. **Create a project** (any name, for example Mnemosyne).
2. **Enable the Gmail API:** APIs & Services → Library → Gmail API → Enable.
3. **Branding:** Google Auth Platform → Branding. Give the app a name and your email as the support and developer contact. Google asks for a homepage and a privacy policy link; any page you control will do (this is a personal app).
4. **Audience:** choose **External**. Add your own Google account as a test user, then **Publish app** so its status is **In production**. This matters: while an app is in *Testing*, Google expires its refresh tokens after 7 days and Gmail would need reconnecting every week. You don't need to submit it for verification; Google shows an "unverified app" warning when you connect, which is expected for a personal app.
5. **Data Access:** add the scope `https://www.googleapis.com/auth/gmail.readonly`.
6. **Clients → Create client → Web application.** Add these authorized redirect URIs:
   - `http://localhost:3100/api/gmail/oauth/callback` (Docker)
   - `http://localhost:5173/api/gmail/oauth/callback` (development, `pnpm dev`)

   Copy the client ID and client secret.
7. Put the values in `.env` (the repo root for Docker, `apps/server/.env` for development):

   ```sh
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   TOKEN_ENCRYPTION_KEY=...   # from: openssl rand -base64 32
   # Development only, to match the redirect URI above:
   # GOOGLE_REDIRECT_URI=http://localhost:5173/api/gmail/oauth/callback
   ```

   `TOKEN_ENCRYPTION_KEY` encrypts the stored Gmail refresh token. Keep it as safe as the secret: a copy of the database is useless without it, and a lost or changed key means Gmail has to be reconnected.
8. Restart the app (`docker compose up -d`), open **Settings**, and press **Connect Gmail** in the Gmail section. Continue past the unverified-app warning and approve read-only access. You land back in Settings with **Connected as** your address.

## Using it

1. Paste a video or article URL and submit. Under the field a **Video / Article** switch shows what was detected; click it to override. The button reads Transcribe for a video and Summarize for an article. **Paste text instead** (for articles) takes the article's text with an optional title, and nothing is fetched. Below the field, **Prompt profile** and **Model** start on your defaults (see Settings below); change them to use another for this video only.
2. Watch the stages: for a video queued, downloading, converting, transcribing, summarizing, ready for review; for an article queued, fetching, summarizing, ready for review. If the page can't be read the job fails with the reason and **Paste text**, which continues the same job with the text you paste.
3. Download the transcript as Markdown, SRT or TXT while a video job is in review (an article offers Markdown only).
4. Review the note. It opens in a rendered editor with a properties panel (title and tags). A toolbar above the note formats it: undo and redo, block type (paragraph, heading 1 to 3, quote), bold, italic, bulleted and numbered lists, and links. It writes plain Markdown (`#`–`###`, `>`, `**bold**`, `*italic*`, `-`, `1.`, `[text](url)`), so Obsidian reads the note as expected. Switch to source mode to see and edit the raw Markdown, front-matter included; the formatting buttons are hidden there. The transcript (or, for an article, its text) sits beside it; clicking a timestamp in the note, or moving the cursor onto one, scrolls the transcript there.
5. Choose where the note goes with **Change folder**: filter the vault's folders (hidden folders are not shown), pick one, or type a new folder name under the chosen folder. A new folder is created only when you save. Without a choice the note goes to `DEFAULT_NOTE_FOLDER`.
6. **Save to vault** writes the note and deletes the transcript, or **Discard** deletes the job.
7. Under the note a line shows how the summary was made: the model, the prompt profile and its version, the tokens in and out, and an estimated cost (for example `Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12`). If the summary was made more than once it also gives the number of attempts and the total. The cost is an estimate from a price table in the app, marked with `~`; a model that isn't in the table shows tokens only. The record is kept in the database even after you save or discard the job.
8. **Linking.** When a summary finishes, a **Linking** step follows (a few seconds to a minute) and the review screen opens with two tabs: **Suggested links (n pending)** and **Source**. Each suggestion shows the target as `[[Target]]`, whether it is an existing note, an existing concept or a new concept, where it goes (`at "phrase"`, the first place that phrase appears in your note, or under `## Related`) and why. **Accept** inserts the link into the note; **Reject** drops it. A suggestion whose phrase you have since edited away is marked **Stale** and offers **Add to Related** instead; one with no phrase does the same. **Accept all** and **Reject all** appear when two or more are pending. Accepting edits the note and saves it as a draft in one step; nothing reaches the vault until you save. A new concept is a `[[link]]` to a note that doesn't exist yet: Obsidian shows it in the graph and creates the note if you open it; the app never creates stub files. At most 8 links are suggested, and only the new note gets links (Obsidian's backlinks show the other direction).
9. **Re-run linking** asks the agent again on the note as it is now (it confirms first if suggestions are still pending, because they are replaced). If linking failed, the review screen says why and offers **Retry linking**; a note that was never linked (linking off, or the agent not set up when it was summarized) offers **Run linking**. A failed linking never fails the job: the note is still there to review and save. Under the note, a second info line shows the linking model, prompt version, tool calls, tokens and estimated cost.
10. **Regenerate summary** runs the summary again on the same transcript, with the profile and model you choose in a dialog (they start on what the job used). It replaces the current note, including your edits, and keeps the vault folder. Use it to compare prompts or models on a real video.

### Settings

The gear at the bottom of the navigation drawer opens **Settings**. The Summarizer section has:

- **Default model and default prompt profile.** They save as soon as you change them. The model list comes from Anthropic, so new models appear without an update, and only models that can produce the structured summary are listed. If Anthropic can't be reached the list shows just the current default and says it is offline. The submit form and the Regenerate dialog can pick another profile or model for one video.
- **Prompt profiles.** A profile is a named prompt (up to 20,000 characters) that tells Claude what to pull out of a video. Three ship with the app: **Business ideas** (the default, aimed at validating ideas), **Coding** and **General** (the 0.3 summary). You can create, rename and delete profiles (the default and the last remaining one can't be deleted). Edit a prompt and **Save** to store it as a new version; unsaved changes are marked, and switching profile or closing the tab asks first. A changed prompt applies to summaries that start after you save; notes already in review keep what they have.
- **History.** Every save is a numbered version. Open any version to read it, and **Restore this version** saves a copy of it as the newest. **Reset to default** does the same with the shipped text, for the profiles that ship.
- **Instructions the app always sends.** Read-only views (one for videos, one for articles) of the fixed part of the prompt that keeps the output in the shape the app needs. Your prompt is added after it, so no edit can break the note.

- **Linking.** Shows whether the agent service is reachable (and, if `AGENT_SECRET` isn't set, how to set it up). **Link notes automatically** turns the linking step on or off for new summaries (it starts on). **Linking model** is separate from the summary model and starts on a Haiku model when the model list has one (ADR 0047). **Linker prompt** is the guidance that tells the agent what makes a good link, with save, history, restore and reset exactly like the summary prompts; it can't be renamed or deleted. **Instructions the app always sends** shows the locked part of the linker's prompt, read from the agent service (unavailable while it is down).
- **Feeds.** Set how often feeds are checked (15 minutes to daily), **Check all now**, and **Add feed**: enter a feed address or a page that links to one, see its title and latest item, pick its prompt profile and whether it summarizes automatically. Each feed has an on/off switch, an automatic switch and a menu (Check now, Edit, Delete). Adding a feed doesn't import its back catalogue: only its newest item goes to the inbox. A check adds at most 10 new items per feed; the rest are marked seen and skipped, and the feed says how many. A failing feed shows its error and keeps being retried.
- **Inbox (feeds).** New feed items wait on the home page with their feed, title and date. **Summarize** (one item or a selection) turns them into normal jobs with the feed's profile, or one you choose for the batch, and the model you choose; **Dismiss** removes them. The jobs made from them show the feed's name.

- **Gmail.** After the setup above, **Connect Gmail** links your account (the section explains what's missing if the variables aren't set). **Disconnect** revokes the access at Google and deletes the stored token; your sources and inbox items stay. If Google stops accepting the connection (you revoked it, or the app went back to Testing), the section shows **Reconnect needed** with the reason, Gmail checks pause, and a warning dot appears on Settings in the navigation drawer; **Reconnect** resumes where it stopped.
- **Gmail sources.** **Add source** takes a name and either one or more Gmail labels (an email with any of them matches) or a Gmail search such as `from:news@example.com`; create labels and filters in Gmail itself. **Preview** shows how many emails match, the newest subject and sender, and a warning if another source has the same rule; a source can only be saved after a preview of its current rule. Choose a prompt profile, whether to **Summarize automatically**, and a **backfill**: none (only the newest email goes to the inbox), the last 30 or 90 days, or all, up to 200 emails. Backfilled emails only land in the inbox; they are never summarized automatically. Sources are checked on the feed interval; each has an on/off switch and a menu (Check now, Edit, Delete), and **Check all now** checks every enabled one. A check adds at most 10 new emails per source, and the rest are marked seen and skipped, as for feeds. Deleting a source asks whether to remove its inbox items.
- **Inbox.** On the home page, new feed items and newsletter emails wait together, newest first, each with its feed or source name; emails also show the sender and a link that opens the email in Gmail. **Summarize** and **Dismiss** work on one item or a selection. Summarizing an email uses its body as the article (links, images, tracking and the unsubscribe footer are dropped), and the note's `source` links to the email, `author` is the sender, `site` the source's name and `published` the date received. An email with too little text can't be summarized and stays in the inbox. Items don't expire; the jobs made from them follow the usual 24-hour review expiry.

The app opens with a navigation drawer on the left (**Transcriber**, with **Settings** and the colour-mode control at the bottom). The hamburger in the top bar collapses it to icons or expands it again, and the choice is remembered in the browser. On a narrow window the drawer is hidden and opens over the page. At the bottom of the drawer, **Light**, **Dark** and **System** set the colour mode (System follows the OS and is the default); that choice is remembered too. The note editor follows the colour mode too.

Edits are saved to the server about a second and a half after you stop typing, when you switch editor mode, leave the editor or choose a folder, and before saving, so a refresh, a crash or another browser shows your latest draft. The status line under the editor reads Saved, Saving… or Not saved, with the reason.

The page address carries the job (`?job=<id>`), so refreshing the page keeps you on the same job. Jobs and their transcripts live in a SQLite database on a Docker volume, so they survive a container restart or rebuild. A job that was downloading, converting or transcribing when the app stopped is marked failed on the next start.

The API also supports listing jobs, listing the vault's folders, updating a review draft, saving it, retrying a failed summary and discarding a job (`GET /api/jobs`, `GET /api/vault/folders`, `PATCH /api/jobs/:id/draft`, `POST /api/jobs/:id/save` with no body, `POST /api/jobs/:id/retry-summary`, `DELETE /api/jobs/:id`). Settings and summaries add `GET` and `PATCH /api/settings`, `GET /api/models`, the prompt profile endpoints under `/api/prompt-profiles` (list, create, rename, delete, versions, restore, reset), `POST /api/jobs/:id/regenerate-summary`, and optional `model` and `profile_id` in the `POST /api/jobs` body. Version 0.5.0 adds `source_type`, `text` and `title` to the `POST /api/jobs` body, `GET /api/jobs/:id/source` (replacing `/transcript`), `POST /api/jobs/:id/text` (pasted text for a failed article job), the feed endpoints (`GET` and `POST /api/feeds`, `POST /api/feeds/preview`, `POST /api/feeds/check`, `PATCH` and `DELETE /api/feeds/:id`, `POST /api/feeds/:id/check`) and the inbox endpoints (`GET /api/inbox`, `POST /api/inbox/summarize`, `POST /api/inbox/dismiss`, taking `{ kind: 'feed' | 'gmail', id }` items; these replace `/api/feed-items`). Version 0.6.0 adds the Gmail endpoints: `GET /api/gmail/account`, `GET /api/gmail/connect` (redirects to Google), `GET /api/gmail/oauth/callback` (Google's redirect target), `POST /api/gmail/disconnect`, `GET /api/gmail/labels`, and the sources under `/api/gmail/sources` (`GET` and `POST`, `POST /api/gmail/sources/preview`, `POST /api/gmail/sources/check`, `PATCH` and `DELETE /api/gmail/sources/:id`, `POST /api/gmail/sources/:id/check`). Jobs from Gmail carry `gmail_source_id` and `gmail_source_name`. Version 0.7.0 adds `GET /api/jobs/:id/link-suggestions`, `POST /api/jobs/:id/link-suggestions/accept` and `/reject` (taking `{ ids }`; accept also takes the edited `note_markdown`) and `POST /api/jobs/:id/linking` (run or re-run linking; optional `note_markdown`), the job status `linking`, the job fields `link_state`, `link_error` and `link_usage`, and `linking_enabled`, `linking_model`, `linker_profile_id`, `agent_status` and `linker_locked_instructions` in settings. The agent service has its own internal API for the server only (`GET /health`, `GET /v1/link/instructions`, `POST /v1/link`; bearer `AGENT_SECRET`) and no published port.

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
| `GOOGLE_CLIENT_ID` | unset | from `.env` |
| `GOOGLE_CLIENT_SECRET` | unset | from `.env` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:<PORT>/api/gmail/oauth/callback` | from `.env`, default as left |
| `TOKEN_ENCRYPTION_KEY` | unset | from `.env` |
| `AGENT_SECRET` | unset (linking off) | from `.env`, required |
| `AGENT_URL` | `http://localhost:8100` | `http://agent:8100` |
| `AGENT_TIMEOUT_MS` | `120000` | default |

- `WORK_DIR` holds audio files while a job runs; the folder is emptied when the server starts.
- `WHISPER_MODEL` is only the label stored on each transcript (whisper-server doesn't report its model). Keep it in step with the model the agent runs.
- `WEB_DIR` is the folder with the built web app; when set, Express serves it.
- `DATA_DIR` holds `mnemosyne.db`. `VAULT_PATH` must exist and be writable at startup, or the server exits with a message.
- `DEFAULT_NOTE_FOLDER` is the vault folder notes go to unless you pick another in the review screen. It is relative to the vault, is created at startup if missing, and must be a plain path such as `Notes/Videos` (no `..`, no leading `/`, no folder starting with a dot). The server never writes outside the vault, whatever folder is asked for.
- The four Google variables are optional. Gmail is off (Settings says so) unless the client ID, the secret and the key are all set; the rest of the app works without them. `TOKEN_ENCRYPTION_KEY` must be 32 bytes in base64 (`openssl rand -base64 32`); any other value stops the server at startup with a message. `GOOGLE_REDIRECT_URI` must match one of the redirect URIs in the Google client exactly.
- `AGENT_SECRET` (at least 32 characters; `openssl rand -hex 32`) must be the same for the app and the agent service; in Docker one `.env` value feeds both. Without it the server starts with linking off and Settings says how to set it up. `AGENT_TIMEOUT_MS` is how long the server waits for one linking run; the agent's own run limit is 90 seconds. The agent service reads `ANTHROPIC_API_KEY`, `AGENT_SECRET` and `VAULT_PATH` (its vault mount is read-only), plus optional limits named `AGENT_MAX_TURNS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_OUTPUT_TOKENS`, `AGENT_RUN_TIMEOUT_SECONDS`, `AGENT_MAX_SUGGESTIONS`, `AGENT_LIST_NOTES_LIMIT`, `AGENT_SEARCH_HITS_LIMIT`, `AGENT_SEARCH_SNIPPET_CHARS`, `AGENT_READ_NOTE_CHARS` and `AGENT_LINK_TARGETS_LIMIT` (the defaults are in `apps/agent/src/mnemosyne_agent/config.py`).
- `ANTHROPIC_API_KEY` lives in `.env` only, never in the repo. In Docker, `.env` at the repo root feeds both compose and the container.
- For development, copy `apps/server/.env.example` to `apps/server/.env` and set `ANTHROPIC_API_KEY` and `VAULT_PATH` (any folder works for trying it out). `pnpm dev` loads it, and the integration tests load it too.
- **The agent service outside Docker.** It needs [uv](https://docs.astral.sh/uv/) and Python 3.14. Run `ANTHROPIC_API_KEY=… AGENT_SECRET=… VAULT_PATH=/path/to/vault pnpm --filter @mnemosyne/agent dev` (port 8100, reloading), and put the same `AGENT_SECRET` and `AGENT_URL=http://localhost:8100` in `apps/server/.env`. The agent only reads the vault, so any copy of a vault works. Stop the agent container first if it is running.

## Development

```sh
pnpm install
pnpm dev                                        # server on :3100, web on :5173 (proxies /api)
pnpm test                                       # unit tests, all packages (the agent's pytest included)
pnpm --filter web test:browser                  # real-browser tests (Chromium and WebKit)
pnpm --filter @mnemosyne/server test:integration  # real yt-dlp, ffmpeg and whisper-server
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter @mnemosyne/agent exec uv run pytest -m docker   # builds the agent image and checks it (needs Docker)
```

`pnpm --filter @mnemosyne/server fixture:gmail <messageId> <name> [display name]` saves a real email from the connected account as a test fixture in `apps/server/src/test-support/gmail/`, with your address, name and the links reduced to a host and a generic path. No test touches Gmail or the network; they use these fixtures and fakes.

Stop the container first (`docker compose stop`): the dev server and the container both use port 3100. Open <http://localhost:5173> while developing. The integration tests need whisper-server running; the Claude integration test also needs `ANTHROPIC_API_KEY` and is skipped without it.

Layout: `apps/server` (Express API, worker, tool clients, formatters), `apps/web` (React UI), `apps/agent` (Python vault agent service: read-only vault tools and the Claude linking agent), `packages/shared` (Zod schemas used by both), `ops/` (launchd plist and entrypoint).

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
- **Settings says Gmail isn't configured.** One of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `TOKEN_ENCRYPTION_KEY` is missing. Set all three in `.env` and restart the container.
- **Gmail shows Reconnect needed.** Google no longer accepts the stored access. The reason is shown. If it happens about a week after connecting, the Google Cloud app is still in *Testing*: publish it to **In production** (see the setup), then press **Reconnect**. It also happens after you remove Mnemosyne in your Google account's third-party access, or after `TOKEN_ENCRYPTION_KEY` changes.
- **After approving Gmail in development you land on port 3100 (or get a connection error).** Google redirected to the Docker port. Under `pnpm dev`, set `GOOGLE_REDIRECT_URI=http://localhost:5173/api/gmail/oauth/callback`, add that URI to the Google client, and restart the dev server.
- **Google says "Error 400: redirect_uri_mismatch".** The redirect URI the app sent isn't in the Google client's list. It must match `GOOGLE_REDIRECT_URI` (or the default for your port) character for character.
- **A Gmail source shows "Label not found in Gmail".** A label it uses was deleted in Gmail. Edit the source and pick the labels again; the rest keep working.
- **An email won't summarize ("too little text" or "too long").** Some emails are mostly images or links. They stay in the inbox; open the email from its link, or dismiss it.
- **Settings says linking isn't set up.** `AGENT_SECRET` is empty or shorter than 32 characters in the server's environment. Set it in `.env` (`openssl rand -hex 32`) and run `docker compose up -d --build`. Notes summarized in the meantime have no link suggestions; open one in review and use **Run linking**.
- **Settings says the agent service is unavailable, or a note shows "Agent service unreachable".** The server can't reach the agent. Check `docker compose ps` (the `agent` container should be healthy) and `docker compose logs agent`; the agent exits at startup with a message if `ANTHROPIC_API_KEY`, `AGENT_SECRET` or `VAULT_PATH` is wrong. While it is down, new summaries go to review without suggestions; use **Run linking** or **Retry linking** once it is back. Outside Docker, check that `AGENT_URL` points at the running `pnpm --filter @mnemosyne/agent dev`.
- **A note shows "Agent service rejected the secret".** The app and the agent have different `AGENT_SECRET` values. Use one value for both and restart both.
- **"Agent service timed out".** A run took longer than `AGENT_TIMEOUT_MS` on the server side. Retry linking; a very large vault or a slow model can need it raised (the agent has its own 90-second run limit, `AGENT_RUN_TIMEOUT_SECONDS`).
- **A link suggestion is marked Stale.** You edited the note after linking and the phrase it pointed at is gone or has changed. **Add to Related** puts the link under `## Related` instead, or reject it.
- **Suggestions look wrong or miss notes.** The agent works from note titles, tags and text search, not embeddings. Edit the linker prompt in Settings → Linking (it applies to the next run), then **Re-run linking**.
- **A YouTube video fails with HTTP 403.** The server retries once after three seconds. If it still fails, submit the URL again later. The container updates yt-dlp each time it starts, so `docker compose restart` can also help.

## Status and roadmap

Version 0.7.0. A single-user tool: one job at a time, jobs kept in SQLite, no accounts.

Possible next steps:

- Freelance job alerts from Gmail (Upwork, Freelancer.com): Claude extraction into a postings dataset and a Freelance jobs page. Deferred from 0.6.0 until real alert emails exist to build against (ADR 0041).
- OPML import and export of feeds, and a per-feed model.
- Lazy-load the note editor (the web bundle is about 1.5 MB).
- A spend summary (per month, per model) built on the recorded usage.
- Create concept notes (stubs, or written by Claude) from popular unresolved concepts, and re-link existing notes in bulk.
- Link notes that are both still in review.
- More endpoints on the vault agent service: a tutor and a business-idea validator.
- Remember the last-used folder, or pick a folder by tag.
- Live progress with Server-Sent Events instead of polling.
- Query past notes through an MCP server.
