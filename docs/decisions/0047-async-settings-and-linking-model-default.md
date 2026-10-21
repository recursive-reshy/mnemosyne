# 0047. Settings resolve the linking model asynchronously; hot paths read narrow accessors

- Status: Accepted
- Date: 2026-10-21

## Context
ADR 0046 and TRD §6.5 give `linking_model` a default of "the newest Haiku", found in the model list "by the same rule as `extraction_model`". In the 0.6.0 code `extraction_model` has no such rule: it falls back to the shipped default model (Sonnet). Finding a Haiku means asking `listModels()`, which is async (a cached call to the Models API), while `getSettings()` was synchronous. The feed and Gmail pollers call `getSettings()` once a minute for the check interval alone, and the summarize step for the default model alone.

## Decision
- `getSettings()` is async. `linking_model` is the stored value, else the first model in `listModels()` whose id contains `haiku` (the Models API lists newest first), else `SHIPPED_DEFAULT_MODEL`. `extraction_model` keeps its current rule.
- Callers that need one stored value stay synchronous through narrow accessors in `settings.service.ts`: `getDefaultModel()` and `getFeedCheckInterval()`. The summarize step and the two pollers use them, so a poll never asks the Models API for a setting it doesn't need.
- `resolveLinkingModel()` is exported and used by the link step, so the model is chosen when linking runs, not when settings were last read.
- `GET` and `PATCH /api/settings` share one assembly, `getSettingsResponse()`, which also adds the agent status and the agent's locked instructions. A down agent or a failed instructions call gives `null`/`unavailable`, never an error.

## Consequences
- The Settings page shows the model linking will actually use even before one is chosen.
- If the model list is unavailable, linking falls back to the default model rather than failing.
- TRD §6.5's "same fallback rule as `extraction_model`" is superseded for `linking_model` by this ADR (until Naresh updates the TRD).

## Alternatives considered
- **Resolve only where used, leave `getSettings()` sync:** smaller, but Settings would show a model that isn't the one linking uses.
- **A fixed Haiku id constant:** sync and simple, but it would not follow newer Haiku releases.
