# 0028. Summary model chosen in the app, listed from the Models API

- Status: Accepted
- Date: 2026-10-17
- Amends: 0014

## Context
ADR 0014 fixed the summary model to Sonnet in `settings.ts`, so a UI choice could be added later. Naresh wants to choose the model from the app and override it per video. A hardcoded list goes stale as models are released and retired.

## Decision
- **The model list comes from Anthropic's Models API** (`models.list` in `@anthropic-ai/sdk`), filtered to active models whose capabilities include structured outputs and medium effort (both used by the summary call) and whose `max_tokens` allows the summary's limit. It is cached in memory for an hour.
- **If the API can't be reached**, the list falls back to the current default model, marked offline, and the fallback isn't cached.
- **The default model is a setting** in SQLite. Until one is saved it is `SHIPPED_DEFAULT_MODEL` (`claude-sonnet-5-5`). There is no environment variable for it; `settings.ts` is removed.
- **A job may store a model override**, chosen on the submit form or in the regenerate dialog, and validated against the list (or the current default) when chosen.
- Per-model tuning (max tokens, effort, thinking) stays fixed in code.

## Consequences
- New models appear without a code change; models without the needed capabilities never show.
- Submitting a job with an override may call the Models API (cached), so `queueJob` is async.
- A model can be retired between choosing it and summarizing; the summary then fails with Anthropic's message and can be regenerated with another model.

## Alternatives considered
- **A hardcoded allowlist:** predictable, but needs a code change for every new model.
- **Global default only:** simpler, but comparing models on one video is the main way to judge them.
- **Model in `.env`:** needs a restart and can't vary per video.
