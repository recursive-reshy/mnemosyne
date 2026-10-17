# Mnemosyne v0.4.0 — Product Requirements

## 1. Summary
v0.4.0 puts the summarizer under Naresh's control from the UI. He can edit the prompt that tells Claude what to pull out of a video, keep several named prompts ("profiles") for different kinds of video, choose which Claude model runs, and see what each summary cost. No deploy is needed to change any of it. The release ships a new default prompt tailored to validating business ideas.

## 2. Background
Up to 0.3.1 the summarizer is one fixed, generic prompt and one hardcoded model (Sonnet). Naresh watches a lot of business and coding videos. A generic summary doesn't extract what he needs: for business videos, what is useful for validating ideas, ideating and pointing him in the right direction; for coding videos, techniques he can apply. Getting a prompt right is trial and error, so changing it must be cheap, reversible and testable against a real transcript. Once the model can be switched, he also needs to see what each choice costs.

## 3. Goals
- Edit the summarizer prompt in the app, with history and a one-click way back to an earlier version or the shipped default.
- Keep several named prompt profiles and pick one per video.
- Choose the default model, and override it per video.
- Regenerate a summary with a different prompt or model, to iterate on a prompt against a real transcript.
- See the tokens and estimated cost of every summary, and which model and prompt version produced it.
- Ship a better default prompt for business videos.

## 4. Non-goals
- **No change to the note's structure.** Notes keep the same sections (Summary, Key points, Notable quotes) and the same front-matter. The prompt changes what goes into them, not their shape.
- No provenance in the note. The model, prompt version and cost stay in the database (Obsidian notes stay clean).
- No per-model tuning in the UI (max tokens, temperature, effort, thinking). Those stay fixed in code.
- No spend dashboard or budget limits. Per-video cost only (§8).
- No vault-searching agent, no article or newsletter ingest (§8).

## 5. User flow
1. **Settings.** A gear icon at the bottom of the navigation drawer, next to the colour-mode control, opens the Settings page. Its Summarizer section has:
   - the **default model** and **default prompt profile**;
   - the **prompt profiles**: pick one to see and edit its prompt, save a new version, browse its history and restore an older version, reset it to the shipped default, and create, rename or delete profiles;
   - a read-only view of the fixed instructions the app always sends, so Naresh knows what his prompt sits on top of.
2. **Submit.** Below the URL field, two selects show the profile and model this video will use, starting on the defaults. Changing them affects only this video.
3. **Review.** Under the note, a line shows how the summary was made: model, profile and prompt version, tokens in and out, and estimated cost (with a total if it was summarized more than once).
4. **Regenerate.** On the review screen, **Regenerate summary** opens a dialog with the profile and model (starting on the ones this job used). Confirming replaces the note with a new summary; the dialog warns that the current note and its edits will be lost. The job shows progress as it does after transcription.

## 6. Features

### 6.1 Editable prompt
As Naresh, I want to change what the summarizer focuses on without a deploy.
- [ ] Each profile has a **guidance** text: plain text, up to 20,000 characters, edited in a multi-line monospace field.
- [ ] The app always adds fixed **instructions** that keep the output in the shape the app needs (how to read the transcript, the four parts of the output, verbatim quotes, tags, no headings). They are shown read-only and cannot be edited, so no edit can break note generation.
- [ ] **Save** stores the text as a new version. Saving text identical to the current version does nothing.
- [ ] Unsaved changes are marked. Switching profile with unsaved changes asks first; reloading or closing the tab warns.
- [ ] A changed prompt applies to summaries that start after the save. Jobs already in review keep their note.

### 6.2 Prompt history
As Naresh, I want to experiment with prompts without losing a good one.
- [ ] Every save is a numbered version (v1, v2, …) with a date and how it was made: shipped default, edit, restore or reset.
- [ ] The history lists every version of a profile, newest first. Any version can be opened read-only.
- [ ] **Restore** makes an older version current by saving a copy of it as the newest version. History is never rewritten.
- [ ] **Reset to default** does the same with the shipped prompt. It is offered only on the profiles the app ships.

### 6.3 Prompt profiles
As Naresh, I want different prompts for business videos and coding videos.
- [ ] The app ships three profiles: **Business ideas** (the default), **Coding**, and **General** (the 0.3 generic summary). Their prompts are seeded as version 1 when 0.4.0 first starts.
- [ ] Naresh can create a profile (name plus starting guidance, prefilled from the profile being viewed), rename one, and delete one.
- [ ] Names are 1–60 characters and unique, ignoring case.
- [ ] The default profile and the last remaining profile cannot be deleted. Deleting a profile doesn't change jobs already summarized with it, and their history still shows its name.
- [ ] The profile picked on the submit form, or in the regenerate dialog, is used for that video only.

### 6.4 Model selection
As Naresh, I want to choose which Claude model summarizes.
- [ ] The model list comes from Anthropic, so new models appear without a code change. It shows only active models that can produce the structured summary the app needs.
- [ ] If Anthropic can't be reached, the list falls back to the current default model, and the page says the list is offline.
- [ ] The default model is set in Settings (initially Sonnet, as in 0.3). The submit form and regenerate dialog can override it for one video.
- [ ] If a chosen model later fails (for example, it was retired), the summary fails with Anthropic's message and Naresh can regenerate with another.

### 6.5 Regenerate summary
As Naresh, I want to try a new prompt or model on a video I've already transcribed.
- [ ] A job in review has **Regenerate summary**, which opens a dialog with profile and model selects, starting on what the job used last.
- [ ] The dialog says the current note and any edits will be replaced. Confirming moves the job to summarizing, and it returns to review with the new note (or to "summary failed", with retry, as today).
- [ ] The chosen vault folder is kept.
- [ ] A failed summary's **Retry summary** uses the job's current profile and model. It doesn't ask.

### 6.6 Usage and cost
As Naresh, I want to know what a summary cost and how it was produced.
- [ ] Every summary attempt is recorded: model, profile, prompt version, input and output tokens, estimated cost in US dollars, and whether it succeeded.
- [ ] The review screen shows the latest attempt (for example "Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12"), and a total when there was more than one attempt.
- [ ] Cost is an estimate from a price table in the app, marked with "~". A model missing from the table shows tokens only.
- [ ] The record survives saving, discarding and expiry of the job, so it can feed a spend summary later.

### 6.7 New default prompts
- [ ] **Business ideas** guides the summary toward: the core claim; ideas worth exploring, with who would pay; the evidence given (numbers, examples) and where there is none; cheap ways to validate the strongest idea; watch-outs (risks, the speaker's unusual advantages); and one concrete next step. It prefers actionable key points and tags about business model, market and tactics. Its full text is in TRD §5.3.
- [ ] **Coding** guides toward what the video teaches, how it works, when to use it and not, gotchas and version-specific advice, and a small exercise to try it.
- [ ] **General** keeps the 0.3 behaviour.

## 7. Constraints
- Single user, local, as before. No accounts; settings are global to the app.
- The API key stays in `.env`. Settings, profiles, versions and usage live in the existing SQLite database; existing jobs and notes carry over unchanged.
- No new dependencies.

## 8. Out of scope (KIV)
- A spend summary (per month, per model) built on the recorded usage.
- Vault-searching agent that adds `[[wikilinks]]` to related notes.
- Article and newsletter ingest.
- Business-idea-validator tab; AI tutor; freelance-jobs module.
- Claude API Workload Identity Federation instead of an API key.
- Timestamp click / caret sync in the editor; lazy-loading the editor.

## 9. Open questions
None.
