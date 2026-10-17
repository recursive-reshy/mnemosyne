# 0014. Summaries with the Claude API, called from the server

- Status: Accepted (amended by 0027, 0028)
- Date: 2026-10-15

## Context
Naresh wants a summary, not the transcript, in Obsidian. Videos are 1–2 hours (roughly 25–35k tokens), which fits in a single model call.

## Decision
- The worker summarizes each transcript with one Claude Messages API call, using **Claude Sonnet** (`claude-sonnet-5-5`) and a generic prompt.
- The call lives in one client module (`clients/claude.client.ts`) with structured output validated by Zod. Tests mock the module.
- The model comes from `settings.ts`, so UI model selection can be added later without touching the client.
- Output is cleaned before use: quotes not found verbatim are dropped, out-of-range timestamps are dropped, and tags are normalized.
- `ANTHROPIC_API_KEY` lives only in `.env`.
- A failed summary keeps the transcript and can be retried.

## Consequences
- Good summaries of long talks with no chunking.
- A small cost per video, and the app needs network access for this step.
- Moving the summarizer to a separate (e.g. Python) service later means replacing one module.

## Alternatives considered
- **Local model (Ollama):** free and private, but competes with Whisper for memory and would need chunking.
- **Separate Python agent service:** a second runtime and contract for what is a single call today. Revisit if the summarizer becomes an agent (e.g. linking to existing vault notes).
- **Haiku:** cheaper; Sonnet chosen because summary quality is the point.
