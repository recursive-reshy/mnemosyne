# Mnemosyne v0.4.0 — Release notes

Prepared 2026-10-17.

v0.4.0 puts the summarizer under your control. You can edit the prompt that tells Claude what to pull out of a video, keep several named prompts for different kinds of video, choose which Claude model runs, regenerate a summary to compare, and see what each summary cost. None of it needs a deploy. The release ships a new default prompt for validating business ideas.

## New

### Prompt profiles
- A **profile** is a named prompt (up to 20,000 characters) that says what to focus on. Three ship with the app: **Business ideas** (the default), **Coding** and **General** (the 0.3 summary).
- Create, rename and delete profiles in **Settings**. The default profile and the last remaining one can't be deleted. Deleting a profile doesn't change jobs already summarized with it.
- The submit form has **Prompt profile** and **Model** selects, starting on your defaults. A change applies to that video only.

### Editable prompt, with history
- Edit a profile's prompt and **Save** to store it as a new version. Unsaved changes are marked, and switching profile or closing the tab asks first.
- Every save is a numbered version with its date and how it was made (shipped default, edit, restore or reset). Open any version to read it, and **Restore this version** saves a copy of it as the newest. History is never rewritten.
- **Reset to default** brings back the shipped text for the profiles that ship.
- A fixed part of the prompt always goes first and keeps the output in the shape the app needs (overview, key points, quotes, tags). It is shown read-only in Settings, so no edit can break note generation.

### Model choice
- The default model is set in Settings (Claude Sonnet 5.5 until you pick one) and can be overridden per video.
- The list comes from Anthropic's Models API, so new models appear without an update. Only active models that can produce the structured summary are listed.
- If Anthropic can't be reached, the list shows just the current default and says it is offline.

### Regenerate summary
- On a note in review, **Regenerate summary** opens a dialog with the profile and model (starting on what the job used). Confirming replaces the note, including your edits, with a new summary and keeps the vault folder. The dialog says so before you confirm.
- Use it to try a new prompt or model on a transcript you already have.

### Usage and cost
- Every summary attempt is recorded with its model, prompt version, tokens in and out, estimated cost in US dollars and whether it worked.
- The review screen shows the latest attempt under the note, for example `Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12`, and a total when there was more than one attempt.
- Nothing is added to the note. The record stays in the database after you save, discard or let the job expire.

## Changes
- **The default summary is now the Business ideas prompt**, which asks for the core claim, ideas worth exploring, evidence, how to validate, watch-outs and a next step. For the 0.3 behaviour, make **General** the default in Settings.
- **The summary model is no longer fixed in code.** It is a setting.
- **Settings** is a new page, reached from the gear at the bottom of the navigation drawer.
- **Jobs have two new fields,** `summary_model` and `prompt_profile_id`, empty for existing jobs (meaning "use the defaults").

## Upgrading
1. **Back up your database first.** Migration 4 adds tables and columns and seeds the three profiles; a backup lets you go back.
   ```bash
   docker compose stop
   mkdir -p ~/mnemosyne-backup
   docker run --rm -v mnemosyne_mnemosyne-data:/data -v ~/mnemosyne-backup:/backup alpine sh -c 'cp /data/mnemosyne.db* /backup/'
   ```
2. Rebuild: `docker compose up -d --build`.
3. On startup the database migrates from version 3 to version 4. Existing jobs and notes are untouched. It was run against a copy of a real 0.3.1 database before release: both jobs came through unchanged.
4. No configuration changes are needed. There are no new environment variables.

## Known issues
- **Claude Haiku 5.5 has no price in the table.** Its price depends on the prompt length, which the table can't express, so it shows tokens only.
- **Costs are estimates** from a price table in the app (checked 2026-10-17), not the bill. Prices can change; the table has to be updated by hand.
- **Settings doesn't block navigation** when a prompt has unsaved changes. Switching profile, reloading and closing the tab ask first; leaving through the drawer doesn't.
- **A model can be retired** between choosing it and summarizing. The summary then fails with Anthropic's message and you can regenerate with another model.
- **Timestamp caret sync still doesn't work in a real browser** (from 0.3.0).
- **The web bundle is about 1.5 MB**, mostly the editor (lazy-loading it is a follow-up).

## Under the hood
- One database module owns the connection and migrations. Migration 4 adds `settings`, `prompt_profiles` (soft-deleted), `prompt_versions` and `summary_runs`, two job columns, and the seed data. Runs have no foreign key to jobs, so they outlive them.
- The Claude client takes the model and guidance and returns the tokens used; a response that comes back unusable (cut off, declined) still records the tokens billed.
- New endpoints: `GET` and `PATCH /api/settings`, `GET /api/models`, the profile endpoints under `/api/prompt-profiles`, and `POST /api/jobs/:id/regenerate-summary`. `POST /api/jobs` accepts optional `model` and `profile_id`.
- `queueJob` is now async because validating a model may call the Models API (cached for an hour).
- The one new status transition is `ready_for_review → summarizing` (regenerate).
- Tests: 202 shared, 727 server and 626 web, all passing, plus lint, typecheck and builds clean.

## Decisions
New ADRs: [0027](../decisions/0027-editable-summarizer-prompts.md) editable summarizer prompts (amends 0014) · [0028](../decisions/0028-summary-model-from-models-api.md) summary model from the Models API (amends 0014) · [0029](../decisions/0029-summary-runs-and-regeneration.md) summary runs and regeneration.
