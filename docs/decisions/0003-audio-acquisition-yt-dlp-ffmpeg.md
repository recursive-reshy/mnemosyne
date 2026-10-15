# 0003. Audio acquisition with yt-dlp and ffmpeg

- Status: Accepted
- Date: 2026-10-14

## Context
Whisper transcribes audio files; it cannot fetch a URL. The app needs to turn a YouTube (or other) link into an audio file plus metadata (title, channel, duration).

## Decision
- **yt-dlp** downloads the best available audio stream and the video metadata.
- **ffmpeg** converts the audio to 16 kHz mono WAV, the format whisper.cpp expects.
- Both are wrapped in service modules (`services/downloader.ts`, `services/audio.ts`) so they can be mocked in tests.
- Downloaded audio is temporary and deleted after each job.

## Consequences
- Supports hundreds of sites beyond YouTube.
- Metadata comes for free and feeds the Markdown frontmatter.
- yt-dlp breaks occasionally when YouTube changes; it must be kept up to date (in Docker, update on container start). Newer versions need a JavaScript runtime (Deno) for YouTube.
- Running from a home connection avoids most of YouTube's blocking of datacenter IPs. If YouTube asks for sign-in, `--cookies-from-browser` is the fallback.
- Downloading YouTube audio is against YouTube's terms; acceptable for personal use, not for a public service.

## Alternatives considered
- **npm caption/stream scraper packages:** fragile, YouTube-only, and less maintained than yt-dlp.
