# 0046. Linker prompt as a prompt profile with a purpose; locked instructions owned by the agent service

- Status: Accepted
- Date: 2026-10-21

## Context
The linker's guidance must be editable in Settings with versions, history and reset, like summary prompt profiles (ADR 0027). Summary runs record provenance and cost (ADR 0029). Its locked instructions describe the agent's tools and the response shape, which the agent service defines and validates.

## Decision
- **`prompt_profiles` gains `purpose`** (`summary` or `linker`). Migration 7 seeds one linker profile with the default guidance as version 1. It is hidden from profile lists and pickers and can't be renamed, deleted or duplicated; its versions, restore and reset use the existing routes and components.
- **Locked instructions live in the agent service** and are served by `GET /v1/link/instructions`; Express proxies them to Settings for read-only display. Express sends only the editable guidance text with each `/v1/link` request.
- **Linking runs are recorded in `link_runs`,** mirroring `summary_runs` (model, prompt version, tokens including cache reads and writes, tool calls, cost, outcome). Cost is computed in Express with `estimateCostUsd`; models without a single price (Haiku, today) show tokens only, as for summaries.
- **Settings gains** `linking_enabled` (default on), `linking_model` (default: the newest model whose ID contains `haiku`, else the default model) and the linker profile's ID.

## Consequences
- Prompt history, restore and reset work for the linker with no new UI code.
- The response shape and the instructions that produce it change together, in one place.
- Settings depends on the agent service to show locked instructions; when it's down, the section says so.

## Alternatives considered
- **A separate `linker_prompt_versions` table:** duplicates the profile versioning code for one prompt.
- **Locked instructions in Express** (as for summaries): they would describe tools and a schema defined in another codebase.
