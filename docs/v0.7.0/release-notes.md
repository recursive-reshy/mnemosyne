# Mnemosyne v0.7.0 — Release notes

Not yet released. Set the date and tag `v0.7.0` when you are ready.

v0.7.0 links your notes together. After a summary, a new vault agent service searches your vault and suggests `[[wikilinks]]` to related notes and concepts; in review you accept or reject each one, and the accepted links are saved with the note, so they show up in Obsidian's graph. The vault is still written only when you save.

## New

### Vault agent service
- A small Python service (`apps/agent`, FastAPI) in its own container. It has read-only tools over the vault (list, search, read, and the existing `[[link]]` targets) and runs a Claude tool-use loop that returns link suggestions. It has no database and no write access: the vault is mounted read-only, and it publishes no port.
- The app calls it over the Compose network with a shared secret (`AGENT_SECRET`). It is built as a reusable service: linking is its first endpoint (ADR 0042).

### Linking
- When a summary finishes, a **Linking** step follows. Each suggestion is an existing note, an existing concept (a `[[link]]` already used in the vault) or a new concept, with an anchor phrase from your note or a place under `## Related`, and a reason. At most 8 per note; the agent reuses existing names before inventing new ones (ADR 0044).
- Linking never fails a job. If the agent is down, unreachable or slow, the note goes to review with the reason and **Retry linking**. A note that was never linked offers **Run linking**.
- Every linking run is recorded with its model, linker prompt version, tool calls, tokens and estimated cost, shown under the note beside the summary line.

### Review
- The review screen has two tabs, **Suggested links (n pending)** and **Source**.
- **Accept** inserts the link at the first occurrence of its phrase; **Reject** drops it; **Accept all** and **Reject all** work on every pending suggestion. A suggestion whose phrase you have since edited away is marked **Stale** and offers **Add to Related**; one with no phrase does the same. Suggestions for a link already in the note say **Already linked** (ADR 0045).
- Accepting changes the editor text and saves the draft in one step, with the decisions, in one transaction.
- **Re-run linking** asks again on the note as it is now (confirming first when suggestions are pending).

### Settings → Linking
- Agent status, a **Link notes automatically** switch, a **Linking model** (starts on the newest Haiku model in the list, ADR 0047), the **linker prompt** with the same save, history, restore and reset as the summary prompts, and the locked instructions read from the agent (ADR 0046).

## Changes
- New endpoints: `GET /api/jobs/:id/link-suggestions`, `POST …/link-suggestions/accept` and `…/reject`, `POST /api/jobs/:id/linking`. The agent has its own `GET /health`, `GET /v1/link/instructions` and `POST /v1/link` (server only).
- `JobStatus` gains `linking`. `Job` gains `link_state`, `link_error` and `link_usage`. `Settings` gains `linking_enabled`, `linking_model`, `linker_profile_id`, `agent_status` and `linker_locked_instructions`.
- Migration 7 adds `link_runs`, `link_suggestions`, `jobs.link_state` and `jobs.link_error`, a `purpose` column on prompt profiles and a seeded **Linker** profile. The prompt profile list in Settings and the submit form still show summary profiles only.
- **`AGENT_SECRET` is now required by Compose** (at least 32 characters). `AGENT_URL` and `AGENT_TIMEOUT_MS` are optional. Without a secret outside Docker the server starts with linking off.
- `getSettings()` on the server is asynchronous, because the default linking model comes from the Models API. This changes TRD §6.5 (ADR 0047).
- A job found in `linking` after a restart is moved to review as a failed linking run, never left stuck.

## Upgrading
1. **Back up your database first.** Migration 7 adds tables and columns; a backup lets you go back.
   ```bash
   docker compose stop
   mkdir -p ~/mnemosyne-backup
   docker run --rm -v mnemosyne_mnemosyne-data:/data -v ~/mnemosyne-backup:/backup alpine sh -c 'cp /data/mnemosyne.db* /backup/'
   ```
2. **Empty the vault first, as planned.** Links only help when they resolve against the notes the app has made, so start 0.7.0 on a fresh vault and let the first notes seed it. (Move your old notes out of the vault folder before you do; the app never deletes anything there.)
3. Add a secret to the `.env` at the repo root: `AGENT_SECRET=` followed by the output of `openssl rand -hex 32`. `docker compose` stops with a message until it is set.
4. Rebuild: `docker compose up -d --build`. Two images are built (the app and the agent). On startup the database migrates from version 6 to version 7; existing jobs, feeds, profiles and settings are untouched. The migration is covered by tests from version 6 and from an empty database, and was also run on a copy of an older backup (version 3), which reached version 7 with its jobs and the three summary profiles kept, the new tables empty and the Linker profile at version 1.
5. Check **Settings → Linking** says the agent is reachable.
6. For development, put the same `AGENT_SECRET` and `AGENT_URL=http://localhost:8100` in `apps/server/.env`, and run the agent with `pnpm --filter @mnemosyne/agent dev` (needs uv and Python 3.14; README, Configuration).

## Deferred
- Concept notes (stubs, or written by Claude) for popular unresolved concepts; re-linking existing notes in bulk; linking between notes that are both still in review.
- More agent endpoints (a tutor, a business-idea validator); the service is built for them.
- Job-alert intake and the Freelance jobs page (ADR 0041).
- Rich-text chips for wikilinks in the note editor; they appear as plain text in rendered mode.

## Known issues
- **Search is text-based, not semantic.** The agent works from titles, tags, text search and existing link targets (ADR 0042), so it can miss a related note that shares no words.
- **Stale detection is text-only.** A suggestion goes stale when its phrase is no longer in the note; it doesn't notice a moved or reworded sentence that still contains the phrase.
- **Links go only into the new note.** Older notes gain backlinks in Obsidian, not text.
- **Linking is skipped, not queued, while the agent is down.** Use **Run linking** afterwards.
- Known from earlier versions: pages that need JavaScript or a login can't be read; the web bundle is about 1.5 MB; costs are estimates from a price table.

## Under the hood
- Agent: `contract/` (Pydantic models, a committed JSON Schema export and golden examples, mirrored by hand in `packages/shared/src/agent.ts`, ADR 0043), `vault/` (paths, notes, search, links), `claude.py`, `linker/` (instructions, tools, loop, checks), `main.py`. Python 3.14, FastAPI, the Anthropic SDK; tests with pytest, Ruff and Pyright.
- Shared: `linkSuggestions.ts` and `wikilinks.ts` (`findAnchor`, `insertLink`, `isStale`, `hasWikilink`).
- Server: `clients/agent.client.ts`, `worker/linkJob.ts`, link run and suggestion repositories, accept in one transaction with the draft.
- Web: `LinkReview`, `LinkSuggestionsPanel`, `LinkingNotice`, `LinkingSettings`, `LinkerPrompt`.
- New dependencies: Python only, in `apps/agent` (`fastapi`, `uvicorn`, `anthropic` and dev tools). None in the Node packages.
- Tests at release: 561 shared, 1805 server and 1181 web unit tests, 22 browser tests (Chromium and WebKit), 218 agent tests and 4 container tests, with lint, typecheck and builds clean.

## Decisions
New ADRs: [0042](../decisions/0042-vault-agent-service.md) vault agent service · [0043](../decisions/0043-agent-contract.md) agent contract · [0044](../decisions/0044-wikilinks-concepts-and-agent-loop.md) wikilinks, concepts and the agent loop · [0045](../decisions/0045-per-link-review.md) per-link review · [0046](../decisions/0046-linker-prompt-and-settings.md) linker prompt and settings · [0047](../decisions/0047-async-settings-and-linking-model-default.md) async settings and the linking model default (changes TRD §6.5).
