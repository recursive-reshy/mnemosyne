# Mnemosyne v0.4.0 — Technical Requirements

Companion to `docs/v0.4.0/prd.md`. The PRD says what; this says how. Where an ADR referenced in `tasks.md` conflicts with this document, the ADR wins until Naresh updates the TRD.

Written against the 0.3.1 code at commit `8eca795`. Names below are the real ones in the repo; "new" marks anything that doesn't exist yet.

## 1. Changes at a glance
- **Shared:** new schemas for settings, models, prompt profiles and versions, summary runs; `CreateJobBody` gains optional `model` and `profile_id`; `Job` gains `summary_model`, `prompt_profile_id` and `summary_usage`.
- **Server:**
  - one database module owns the connection and migrations; migration 4 adds the settings, prompt and summary-run tables, job columns, and seeds the shipped profiles;
  - the Claude client takes the model and guidance as input and returns token usage;
  - a new models client lists models from Anthropic's Models API;
  - every summary attempt is recorded with its cost;
  - new endpoints for settings, models, prompt profiles and regenerating a summary.
- **Web:** a Settings page behind a gear in the drawer footer; profile and model selects on the submit form; a provenance line and a Regenerate dialog on the review screen.
- **No new dependencies** in any package.

## 2. Data (SQLite)

### 2.1 One database module (`repositories/database.ts`, new)
`jobStore.repository.ts` holds the connection, the migration runner and the migration list today. Move those into `database.ts`:
- `openDatabase( path )` / `closeDatabase()` replace `openJobStore` / `closeJobStore` (same behaviour: WAL, run migrations). `getDatabase()` returns the open handle or throws `'Database is not open'`.
- `runMigrations` and the `Migration` type move unchanged. The list is renamed `migrations`.
- `jobStore.repository.ts` keeps only job queries and imports `getDatabase`.
- `server.ts`, `shutdown.ts` wiring and `test-support/jobStore.setup.ts` (renamed `database.setup.ts`, and `vitest.config.ts` updated) call the new names.
- This is a refactor: existing repository tests move with their code and pass unchanged apart from the renamed functions.

### 2.2 Migration 4 (a function migration)
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- JSON
);
CREATE TABLE prompt_profiles (
  id TEXT PRIMARY KEY,           -- uuid
  name TEXT NOT NULL,
  seed_key TEXT,                 -- 'business' | 'coding' | 'general' for shipped profiles, else NULL
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX prompt_profiles_active_name
  ON prompt_profiles ( lower( name ) ) WHERE deleted_at IS NULL;
CREATE TABLE prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL REFERENCES prompt_profiles ( id ),
  version INTEGER NOT NULL,      -- 1, 2, … per profile
  guidance TEXT NOT NULL,
  source TEXT NOT NULL,          -- 'seed' | 'edit' | 'restore' | 'reset'
  created_at TEXT NOT NULL,
  UNIQUE ( profile_id, version )
);
CREATE TABLE summary_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,          -- no foreign key: runs outlive the job (PRD §6.6)
  model TEXT NOT NULL,
  prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
  input_tokens INTEGER,          -- NULL when no response came back
  output_tokens INTEGER,
  cost_usd REAL,                 -- NULL when unpriced or no usage
  outcome TEXT NOT NULL,         -- 'succeeded' | 'failed'
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX summary_runs_job ON summary_runs ( job_id, id );
ALTER TABLE jobs ADD COLUMN summary_model TEXT;
ALTER TABLE jobs ADD COLUMN prompt_profile_id TEXT;
```
Then, in the same migration, seed:
- the three shipped profiles from `SEEDED_PROFILES` (§5.3), each with version 1 (`source = 'seed'`);
- `settings`: `default_profile_id` = the Business ideas profile's id. `default_model` is **not** seeded; it falls back to `SHIPPED_DEFAULT_MODEL` (§4.1) until Naresh picks one.

Existing jobs keep `summary_model` and `prompt_profile_id` NULL, meaning "use the defaults at summarize time". The migration is tested from `user_version = 3` against a database holding a job in review, and must leave that job's note untouched.

The seed reads the constants as they are when the migration is written. Changing a shipped prompt later changes only what **Reset to default** restores; it never rewrites history (ADR 0027).

### 2.3 Repositories (new)
Each is synchronous free functions on `getDatabase()`, like the job store, and holds no rules.
- `settings.repository.ts`: `getSetting( key )`, `setSetting( key, value )` (JSON in and out, parsed with Zod by the caller's schema).
- `promptProfiles.repository.ts`: `listActiveProfiles()`, `findProfileById( id )` (deleted ones too), `insertProfile`, `renameProfile`, `markProfileDeleted`, `countActiveProfiles()`, `findLatestVersion( profileId )`, `listVersions( profileId )` (newest first), `findVersionById( id )`, `insertVersion( profileId, guidance, source )` (assigns `max( version ) + 1` inside a transaction). A unique-name violation is surfaced as a typed result the service turns into a `ConflictError`.
- `summaryRuns.repository.ts`: `insertSummaryRun( run )`, `listRunsForJob( jobId )` (oldest first).
- `jobStore.repository.ts`: `StoredJob`, `JobRow`, insert, update and `toRow` gain `summary_model` and `prompt_profile_id`.

Update `apps/server/CLAUDE.md`: repositories are "the SQLite database (jobs, settings, prompts, summary runs), and nothing else"; the setup file name.

## 3. Shared contracts (`packages/shared`)
New file `summarizer.ts`, exported from `index.ts`. Field names snake_case.

```ts
ModelOption        = { id: string, display_name: string }
ListModelsResponse = { models: ModelOption[], source: 'api' | 'fallback' }

Settings           = { default_model: string, default_profile_id: z.uuid() }
GetSettingsResponse = { settings: Settings, locked_instructions: string }
UpdateSettingsBody = { default_model?: string, default_profile_id?: uuid }   // at least one

PromptVersionSource = 'seed' | 'edit' | 'restore' | 'reset'
PromptVersion      = { id: int, profile_id: uuid, version: int, guidance: string,
                       source: PromptVersionSource, created_at: iso }
PromptProfile      = { id: uuid, name: string, can_reset: boolean,
                       current_version: PromptVersion, created_at: iso }
Guidance           = z.string().trim().min( 1 ).max( 20_000 )
ProfileName        = z.string().trim().min( 1 ).max( 60 )

ListPromptProfilesResponse = { profiles: PromptProfile[] }      // active only, by name
PromptProfileResponse      = { profile: PromptProfile }
CreatePromptProfileBody    = { name: ProfileName, guidance: Guidance }
RenamePromptProfileBody    = { name: ProfileName }
SavePromptVersionBody      = { guidance: Guidance }
ListPromptVersionsResponse = { versions: PromptVersion[] }      // newest first

SummaryRun   = { model: string, profile_id: uuid, profile_name: string, prompt_version: int,
                 input_tokens: int | null, output_tokens: int | null, cost_usd: number | null,
                 outcome: 'succeeded' | 'failed', created_at: iso }
SummaryUsage = { last_run: SummaryRun, run_count: int,
                 total_input_tokens: int, total_output_tokens: int,
                 total_cost_usd: number | null }   // null if any run with tokens is unpriced

RegenerateSummaryBody = { model?: string, profile_id?: uuid }
```
Changes to existing contracts:
- `CreateJobBody` gains `model?: string` (min 1) and `profile_id?: uuid`.
- `Job` gains `summary_model: string | null`, `prompt_profile_id: uuid | null`, `summary_usage: SummaryUsage | null` (null until the first attempt).
- Tests for each schema: valid and invalid examples, trimming, the at-least-one refinement.

## 4. Server: summarizer

### 4.1 Prompt and model constants (`src/summarizer/`, new folder)
- `summarizer/prompts.ts`: `LOCKED_INSTRUCTIONS` (§5.1) and `SEEDED_PROFILES` (`{ seedKey, name, guidance }[]`, §5.3). `buildSystemPrompt( guidance )` returns the locked instructions, a blank line, then the guidance inside `<guidance>` tags.
- `summarizer/pricing.ts`: `MODEL_PRICES` (US dollars per million input and output tokens), keyed by model id, with `PRICES_CHECKED_ON` (date) and a source comment pointing at Anthropic's pricing page. Fill it at implementation time from that page for every model the Models API lists as active; don't use remembered prices. `estimateCostUsd( model, inputTokens, outputTokens ): number | null` (null when the model isn't in the table or a count is null).
- `settings.ts` is replaced: `SHIPPED_DEFAULT_MODEL = 'claude-sonnet-5-5'` moves to `summarizer/models.ts`. `getSummaryModel` is deleted (its test goes with it); callers get the model from the settings service. Add `src/summarizer/` to the folder list in `apps/server/CLAUDE.md` ("pure constants and functions for the summarizer: locked prompt, seeded profiles, prices").

### 4.2 Claude client (`clients/claude.client.ts`)
- Signature: `summarizeTranscript( { transcript, model, guidance } ): Promise< SummaryOutcome >` where `SummaryOutcome = { summary: SummaryResult, usage: TokenUsage }` and `TokenUsage = { input_tokens: number, output_tokens: number }`.
- `system: buildSystemPrompt( guidance )`, `model` from the input. `MAX_TOKENS`, `effort: 'medium'`, the Zod output format and the error handling stay as they are.
- When a response came back but is unusable (`max_tokens`, `refusal`, `parsed_output === null`), throw a `SummaryError` (new, in the client) that carries the `usage`, so the run still records the tokens that were billed. API errors throw `SummaryError` without usage.
- Tests mock the SDK as today and assert the model, the system prompt (locked part plus guidance) and the returned usage.

### 4.3 Models client (`clients/anthropicModels.client.ts`, new)
- `listSummaryModels(): Promise< ModelOption[] >` calls the Models API through `@anthropic-ai/sdk` (`client.models.list`) with `lifecycle: 'active'`, following pages until `has_more` is false.
- Keeps models where `capabilities.structured_outputs.supported` is true and `capabilities.effort.medium.supported` is true (the summary call uses both) and `max_tokens` is null or at least `MAX_TOKENS`. Models with `capabilities: null` are dropped. Order as the API returns them (newest first).
- Before planning, check the SDK's types for `models.list` and the capability fields with Context7 (or the API reference if the quota is out). If the installed SDK version doesn't expose `capabilities` or the `lifecycle` filter, stop and ask: upgrading the SDK is a dependency change.
- Tests mock the SDK: filtering, pagination, a model without capabilities, an error.

### 4.4 Services (new)
- `models.service.ts`
  - `listModels(): Promise< ListModelsResponse >`: in-memory cache for 1 hour. On a client error, return the fallback `[ current default model ]` with `source: 'fallback'` and log the error; don't cache the fallback.
  - `assertKnownModel( model )`: throws `ValidationError( 'Unknown model: …' )` unless `model` is in `listModels()` or equals the current default.
  - Display names for the fallback list: the id itself.
- `settings.service.ts`
  - `getSettings(): Settings` (default model falls back to `SHIPPED_DEFAULT_MODEL`), `getLockedInstructions()`.
  - `updateSettings( body )`: model through `assertKnownModel`; profile must exist and not be deleted (`ValidationError`).
- `prompts.service.ts`
  - `listProfiles()`, `findProfile( id )` (`NotFoundError` for unknown or deleted).
  - `createProfile( { name, guidance } )` → profile with version 1 (`source: 'edit'`); duplicate name → `ConflictError( 'A profile with that name already exists' )`.
  - `renameProfile( id, name )`, same duplicate rule.
  - `deleteProfile( id )`: `ConflictError` for the default profile or the last active one; otherwise soft delete.
  - `saveVersion( id, guidance )`: if the trimmed guidance equals the current version's, return the profile unchanged; else insert `source: 'edit'`.
  - `restoreVersion( id, versionId )`: the version must belong to the profile (`NotFoundError` otherwise); insert a copy with `source: 'restore'`.
  - `resetProfile( id )`: only when `seed_key` is set (`ConflictError` otherwise); insert the seeded guidance with `source: 'reset'`.
  - `listVersions( id )`.
  - `resolvePrompt( profileId | null ): { profile, version }`: null → the default profile; a deleted profile is still resolved (a job may have picked it before deletion); a missing one falls back to the default and logs.
  - `can_reset` = `seed_key !== null`.

### 4.5 Jobs service and worker
- `queueJob( url, options )`: `options.model` through `assertKnownModel`, `options.profile_id` must be an active profile (`ValidationError`); both stored on the job (`summary_model`, `prompt_profile_id`), or NULL when not given. Because `assertKnownModel` may call the Models API, `queueJob` becomes async; the controller awaits it.
- `toPublicJob` adds `summary_model`, `prompt_profile_id` and `summary_usage` built from `listRunsForJob` (latest run, count, sums; profile name from `findProfileById`, deleted profiles included).
- `summarizeJob( jobId )` (worker):
  1. Resolve the model (`job.summary_model ?? getSettings().default_model`) and the prompt (`resolvePrompt( job.prompt_profile_id )`).
  2. Call the client; clean and format as today; `completeSummary`.
  3. Record one `summary_runs` row whether it succeeded or failed: tokens from the outcome or the `SummaryError`, `estimateCostUsd`, the error message on failure.
  Recording goes through a new service function (`recordSummaryRun` in `jobs.service.ts`), never the repository directly.
- `regenerateSummary( id, { model, profile_id } )` (new): job must be `ready_for_review` (`ConflictError` otherwise); validate as in `queueJob`; store the new choices when given (keep the old ones otherwise); move to `summarizing` with `error: null`, `expires_at: null`. `note_markdown` stays until `completeSummary` overwrites it; `target_folder` is kept. This is the one new status transition (ready_for_review → summarizing), recorded in ADR 0029.
- `retrySummary` is unchanged: it uses whatever the job has stored.
- `completeSummary` and `failSummary` are unchanged.

## 5. Prompt text

### 5.1 Locked instructions (`LOCKED_INSTRUCTIONS`)
Shown read-only in Settings. Sent first in every system prompt.
```
You summarize the transcript of a video for a personal Obsidian vault.

Each transcript line starts with the second at which it begins, in square brackets, for example [754].

Your output has four parts:
- overview: the main summary, in Markdown. Use paragraphs, bullet lists and bold lead-ins. Do not use headings, tables, images or code blocks; the app adds the headings.
- key_points: the most useful points, in the order they come up. Each is one or two sentences on a single line, with the second where it is made.
- quotes: notable lines copied word for word from the transcript, each with the second where it occurs. A quote that is not word for word is discarded.
- tags: 3 to 5 short topical tags, lowercase, without the # sign.

Use only what the transcript says. When you add your own judgement, label it as your inference.
Follow the guidance below on what to focus on and how to frame it. If it conflicts with the rules above, the rules above win.
```
Before planning, check whether inline code (backticks) and bold lead-ins round-trip through the editor (ADR 0023 fixtures in `apps/web`). If inline code doesn't, add "or inline code" to the forbidden list and remove the backticks hint from the Coding guidance (§5.3), and note it in the log.

### 5.2 How the system prompt is assembled
```
<LOCKED_INSTRUCTIONS>

<guidance>
<the profile's current guidance>
</guidance>
```

### 5.3 Seeded profiles (`SEEDED_PROFILES`)
**Business ideas** (`seed_key: 'business'`, the default profile)
```
I'm a full-stack software engineer and freelancer looking for business ideas worth pursuing. I watch business videos to find ideas, test them, and decide what to do next. Summarize for that purpose, not as a neutral recap.

Overview: cover these, in this order, each as a bold lead-in followed by a short paragraph or list. Skip any the video gives you nothing for.
- **The core claim:** what the speaker argues, or what the business is, in two or three sentences.
- **Ideas worth exploring:** concrete business or product ideas from the video, or ones it clearly points to. For each, who would pay for it and why.
- **Evidence:** numbers, examples and results the speaker gives (revenue, prices, customer counts, timelines, channels). Say plainly when a claim has no evidence behind it.
- **How to validate:** cheap, fast ways to test the strongest idea before building anything, taken from the video where possible.
- **Watch-outs:** risks, survivorship bias, and anything that depends on the speaker's unusual advantages (an audience, capital, timing, connections).
- **Next step:** one specific thing I could do this week.

Key points: prefer specific, usable points (tactics, numbers, pricing, frameworks, decision rules) over general motivation. Skip sponsor reads, self-promotion and filler.

Quotes: prefer lines that state a principle, a number or a decision rule.

Tags: prefer the business model, market and tactics (for example saas, pricing, cold-outreach) over people's names.
```

**Coding** (`seed_key: 'coding'`)
```
I'm a full-stack TypeScript developer (Node, Express, React, SQLite). I watch coding videos to learn techniques I can use in my own projects. Summarize for that purpose.

Overview: cover these, in this order, each as a bold lead-in followed by a short paragraph or list. Skip any the video gives you nothing for.
- **What it teaches:** the technique, tool or idea, in two or three sentences.
- **How it works:** the main steps or mechanism, in order.
- **When to use it, and when not to:** the trade-offs the speaker gives, and any you can see (label those as your inference).
- **Gotchas:** mistakes, edge cases and anything tied to a specific version of a library or tool. Name the version when the speaker does.
- **Try it:** one small exercise to apply this in a real project.

Key points: concrete techniques, APIs, commands, settings and pitfalls. Keep names of libraries, functions and commands exactly as said, in backticks.

Quotes: prefer rules of thumb.

Tags: technologies and concepts (for example react, testing, sqlite), not the speaker's name.
```

**General** (`seed_key: 'general'`), the 0.3 behaviour
```
Write the overview in a few paragraphs covering the main argument.
List the key points.
Pick notable quotes.
Suggest short topical tags.
```

## 6. API (new and changed)
Each new resource gets its own `routes/`, `controllers/` and `services/` files, following the layers in `apps/server/CLAUDE.md`, mounted in `app.ts`.

| Method and path | Body | Response | Errors |
|---|---|---|---|
| `GET /api/settings` | — | 200 `GetSettingsResponse` | |
| `PATCH /api/settings` | `UpdateSettingsBody` | 200 `GetSettingsResponse` | 400 |
| `GET /api/models` | — | 200 `ListModelsResponse` | |
| `GET /api/prompt-profiles` | — | 200 `ListPromptProfilesResponse` | |
| `POST /api/prompt-profiles` | `CreatePromptProfileBody` | 201 `PromptProfileResponse` | 400, 409 |
| `PATCH /api/prompt-profiles/:id` | `RenamePromptProfileBody` | 200 `PromptProfileResponse` | 400, 404, 409 |
| `DELETE /api/prompt-profiles/:id` | — | 204 | 404, 409 |
| `GET /api/prompt-profiles/:id/versions` | — | 200 `ListPromptVersionsResponse` | 404 |
| `POST /api/prompt-profiles/:id/versions` | `SavePromptVersionBody` | 200 `PromptProfileResponse` | 400, 404 |
| `POST /api/prompt-profiles/:id/versions/:versionId/restore` | — | 200 `PromptProfileResponse` | 404 |
| `POST /api/prompt-profiles/:id/reset` | — | 200 `PromptProfileResponse` | 404, 409 |
| `POST /api/jobs` (changed) | `CreateJobBody` | 202 as today | 400 unknown model or profile |
| `POST /api/jobs/:id/regenerate-summary` | `RegenerateSummaryBody` | 202 `GetJobResponse` | 400, 404, 409 |

`GET /api/jobs` and `GET /api/jobs/:id` return the extended `Job`. `:versionId` is parsed as a positive integer with a local Zod schema in the controller.

## 7. Web

### 7.1 Data layer
- `api/settings.api.ts`, `api/models.api.ts`, `api/prompts.api.ts` (new), following `jobs.api.ts` (shared `send`/`request` helpers: move them to `api/request.ts` so all four modules share them; `jobs.api.ts` behaviour unchanged).
- `jobs.api.ts`: `createJob( url, options? )`, `regenerateSummary( id, body )`.
- `queryKeys.ts`: `settingsKeys.all = [ 'settings' ]`, `modelKeys.all = [ 'models' ]`, `promptKeys.profiles = [ 'prompt-profiles' ]`, `promptKeys.versions( id ) = [ 'prompt-profiles', id, 'versions' ]`.
- Hooks (new): `useSettings` (query + update mutation), `useModels` (query, `staleTime` 1 hour), `usePromptProfiles` (query plus create, rename, delete, save, restore, reset mutations; each invalidates `promptKeys.profiles` and that profile's versions), `usePromptVersions( id )`, `useRegenerateSummary`.

### 7.2 Navigation
- New route `/settings` → `SettingsPage` in `App.tsx`.
- `NavDrawer`: the footer becomes a `Divider`, a **Settings** `ListItemButton` (gear icon `@mui/icons-material/Settings`, label "Settings", tooltip when collapsed, `aria-current="page"` on `/settings`, closes the overlay on narrow windows), then `ColorModeControl` as today. Settings is not in `NAV_ITEMS`: it is a utility entry, not a module (ADR 0025 still applies: the shell renders a `Link` and reads the location).
- `SettingsPage` is a route component (it may read the URL; it doesn't need to).

### 7.3 Settings page (new components)
- `SettingsPage`: page title "Settings", one section "Summarizer" holding the components below. Loading and error states as on other pages.
- `SummarizerDefaults`: two MUI `TextField select`s, "Default model" (from `useModels`, display names; an "offline list" `Alert severity="info"` when `source` is `fallback`) and "Default prompt profile". Changing either saves at once through `useSettings`, with a `role="status"` "Saved" line.
- `LockedInstructions`: a collapsed `Accordion` "Instructions the app always sends", read-only monospace text.
- `PromptProfiles`: a profile picker (`TextField select` or `Tabs`; pick one that keeps the tests role-based), the default marked "(default)", and actions **New profile**, **Rename**, **Delete** (Delete disabled with a tooltip reason for the default or the last profile; confirm dialog otherwise).
- `PromptEditor`: multiline `TextField` labelled "Guidance" in a monospace font, a character count against 20,000, **Save** (disabled when unchanged or invalid), **Discard changes**, and **Reset to default** (only when `can_reset`, confirm dialog). Shows "Unsaved changes" as text, not colour alone. Switching profile with unsaved changes opens a confirm dialog. A `beforeunload` listener warns on reload or tab close while dirty. Leaving through the drawer is not blocked (the app uses `BrowserRouter`, which has no navigation blocker); accepted.
- `PromptHistory`: list of versions (version, date, source label, first line), selecting one shows it read-only with **Restore this version** (not on the current one).
- `ProfileNameDialog`: shared by New and Rename; New also prefills guidance from the profile being viewed. Shows the server's 409 message on a duplicate name.
- Files stay under about 150 lines (`apps/web/CLAUDE.md`); split by these responsibilities.

### 7.4 Submit form
- `SummaryOptions` (new): "Prompt profile" and "Model" `TextField select`s, `size="small"`, starting on the settings defaults, below the URL field. `SubmitForm` gains `profiles`, `models` and the chosen values as props; `HomePage` holds the state and passes `model` and `profile_id` to `createJob` only when they differ from the defaults (so a later change of default doesn't matter for jobs that took the default).
- While settings, profiles or models are loading, the selects render disabled with the default label; the form can still submit with no options.

### 7.5 Review screen
- `SummaryInfo` (new), under the note: "<model display name> · <profile name> v<n> · <in>k in / <out>k out · ~US$<cost>" from `summary_usage.last_run`, plus "<count> attempts, ~US$<total> total" when `run_count > 1`. Tokens as thousands with one decimal; cost to 2 decimals (3 when under US$0.01); no cost part when null. Model display name from `useModels`, falling back to the id.
- `ReviewActions` gains **Regenerate summary** (outlined) when not failed.
- `RegenerateDialog` (new): profile and model selects starting on the job's (`prompt_profile_id` if still active, else the default; `summary_model` else the default), the warning text from PRD §6.5, Cancel and Regenerate. On success, the job query is updated and `JobPage` shows progress as it does for `summarizing` today.
- Before the dialog, flush pending autosave is **not** needed (the note is being replaced), but cancel the debounced autosave so it doesn't PATCH a job that is now `summarizing` (a 409). Check `useAutosaveDraft` for how to do that and plan it.

## 8. Tests
- **Test-first** as always. Every existing test passes unchanged except: the renamed database functions (§2.1), `settings.test.ts` (deleted with `settings.ts`), and the Claude client tests where the signature changes (§4.2). List each change in the task's log line.
- **Shared:** schema tests (§3).
- **Server:**
  - migration 4 from `user_version = 3` with a job in review (note untouched, seeds present, default profile set, new columns NULL); running all migrations from empty;
  - repositories: version numbering per profile, unique active names (a deleted name can be reused), runs listed per job;
  - `prompts.service`: every rule in §4.4, including no-op save, restore copying, reset only on seeded profiles, delete guards, `resolvePrompt` for null, deleted and missing profiles;
  - `models.service`: cache (fake timers), fallback not cached, `assertKnownModel`;
  - `estimateCostUsd`: priced, unpriced, null tokens;
  - `buildSystemPrompt`: exact output;
  - `summarizeJob`: uses the job's or default model and profile; records a succeeded run with cost, a failed run with tokens from `SummaryError`, a failed run without tokens on an API error;
  - `regenerateSummary`: status rules, keeps choices when not given, keeps `target_folder`, then a normal summarize completes it;
  - every endpoint in §6 through `app.ts` with Supertest, including each error status.
- **Web:**
  - hooks with the `api/` modules mocked; `api/` modules with `fetch` stubbed;
  - `NavDrawer`: Settings item present expanded and collapsed (tooltip), current on `/settings`, closes the overlay;
  - `SummarizerDefaults`, `PromptEditor` (dirty state, save disabled when unchanged, char limit, reset confirm, switch-profile confirm), `PromptHistory` (restore), `PromptProfiles` (create, rename with 409 message, delete guards), `SummaryOptions` (defaults, only changed values sent), `SummaryInfo` (formatting cases), `RegenerateDialog` (starting values, warning text, submit);
  - `JobPage`/`ReviewScreen`: regenerate moves to the progress view; the autosave timer is cancelled.
- **Browser checks** (as `apps/web/CLAUDE.md` requires), light and dark: Settings page (wide and narrow), the drawer footer collapsed and expanded, the submit form with options, the review screen with the info line and the dialog.
- **Real check** (needs Naresh): one real video with Business ideas on Sonnet, then regenerate with Coding or General on another model; check the notes, the info line and the recorded cost against the Anthropic console.

## 9. Phases (detail in `tasks.md`)
1. **Kick-off:** ADRs indexed and accepted.
2. **Shared contracts.**
3. **Server data:** database module refactor, migration 4 and seeds, repositories.
4. **Server summarizer:** prompts and pricing, Claude client with model, guidance and usage, models client and service, settings and prompts services, `summarizeJob` with runs, `queueJob` options, `regenerateSummary`.
5. **Server API:** settings, models, prompt-profile endpoints, job endpoints changes; server docs.
6. **Web Settings:** data layer, drawer footer and route, Settings page components.
7. **Web jobs:** submit options, review info line, regenerate dialog.
8. **Clean-up and verification:** docs (README, CLAUDE.md files), versions 0.4.0 in every `package.json`, final checks, release notes.

Suggested checkpoints: **A** = phases 1–3, **B** = phases 4–5, **C** = phase 6, **D** = phases 7–8.

## 10. ADRs (new, drafted with this TRD)
- 0027 Editable summarizer prompts: profiles of versioned guidance on a locked contract (amends 0014)
- 0028 Summary model chosen in the app, listed from the Models API (amends 0014)
- 0029 Summary runs: provenance and cost in the database, and regenerating a summary

## 11. Open questions
None.
