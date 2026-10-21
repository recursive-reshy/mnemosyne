# Mnemosyne v0.7.1 — Product Requirements

## 1. Summary
v0.7.1 is a consolidation release. It splits Settings into tabs, adds one place to see whether every source and service is working, lets Naresh back up the database whenever he wants, and tightens the internals behind the seven feature releases since 0.1.0: one documented job lifecycle, structured logs, an end-to-end smoke test and a dependency refresh. Transcribing, summarizing, linking, reviewing and saving don't change.

## 2. Background
Since 0.4.0, each feature added its section to the single Settings page: summarizer defaults, prompt profiles, feeds, Gmail, locked instructions and linking. It now scrolls a long way, and the prompt editors, the part Naresh edits most, are squeezed into a 40rem column.

Feeds and Gmail are polled in the background. Each source shows its last check and last error in its own list, but nothing outside Settings says that something is failing, and nothing shows how long ago a source last worked. A dead feed is noticed only when items stop arriving. The agent service's status appears only in the Linking section.

The data lives in one SQLite file on a Docker volume, with no backup. The job flow has grown from one source to five (video, article, feed item, newsletter, linking), and its states and expiry rules are spread across the worker, the sweeper and the adapters. Logs are plain `console.log` lines that can't be followed from the server into the agent service. No test runs the whole stack together.

The next modules (business-idea validator, tutor) will build on this base, so this release fixes it while it's still small.

## 3. Goals
- Settings is quick to find your way around, and the prompt editors have room.
- Naresh sees at a glance whether every source and service is working, and is told when one isn't, without opening Settings.
- Naresh can take a copy of his data outside Docker at any time, and the restore steps are written down.
- One documented job lifecycle that the code enforces.
- A broken release is caught by one command that runs the whole stack.

## 4. Non-goals
- **No change to how jobs behave.** Statuses, expiry times, retry, linking and saving behave as in 0.7.0. The lifecycle work documents and enforces the current behaviour; if the audit finds a real bug, it is raised as a question, not silently changed.
- No new sources, no job-alert intake (ADR 0041), no validator or tutor.
- No change to the summary or link output, prompts or models.
- No cloud backup integration. Backups go to a host folder; getting them off the machine is up to that folder (e.g. a synced folder).
- Claude API Workload Identity Federation stays KIV.

## 5. User flow
1. Naresh opens **Settings** from the drawer. It opens on the **Prompts** tab. Tabs across the top: **Prompts**, **Models**, **Sources**. Each tab has its own address, so a tab can be bookmarked, and Back returns to the previous tab.
2. **Prompts** shows a list on the left (summary prompt profiles, then the linker prompt) and the selected prompt's editor on the right, with its history and the locked instructions below it.
3. **Models** holds the summary model, the linking model and the linking on/off switch.
4. **Sources** opens with a **Status** panel: one row for each feed, Gmail source, the Gmail connection, the agent service, whisper-server and the last backup. The feed and Gmail source lists follow.
5. When something is failing, the Settings item in the drawer shows a warning badge, so Naresh notices from any page. Clicking a row's error shows the recent errors in full.
6. When Naresh wants a backup, he clicks **Back up now** in the Status panel. The app writes a copy of the database to `~/mnemosyne-backups` on the Mac, and the panel shows when the last backup ran.

## 6. Features

### 6.1 Settings in tabs
As Naresh, I want Settings split up so I can find things and edit prompts comfortably.
- [ ] Settings has three tabs: **Prompts**, **Models**, **Sources**, each at its own route (`/settings/prompts`, `/settings/models`, `/settings/sources`). `/settings` goes to Prompts. An unknown tab goes to Prompts.
- [ ] Every control in 0.7.0's Settings page is on exactly one tab, and works as before:
  - **Prompts:** summary prompt profiles, the linker prompt, the locked instructions (video, article, linker), each read-only.
  - **Models:** summary model default, linking model, linking on/off. The agent service's reachability moves to the Status panel.
  - **Sources:** Status panel (§6.3), feeds, Gmail connection and Gmail sources.
- [ ] The drawer's Settings item shows as current on every tab.
- [ ] Switching tab, or leaving Settings, with unsaved prompt edits asks first, as the editor does today.
- [ ] Tabs work with the keyboard and are announced as tabs to screen readers.

### 6.2 Prompts tab: list and editor side by side
As Naresh, I want more room to read and edit prompts.
- [ ] On wide windows, a list on the left shows the summary prompt profiles (default marked) and, in its own group, the linker prompt. The editor fills the rest of the width.
- [ ] Selecting an item opens it in the editor, with its version history, reset to default and, below, the locked instructions that are always sent with it.
- [ ] Creating, renaming, deleting and setting the default profile work from the list as they do today.
- [ ] The selected prompt is part of the address, so a reload keeps it.
- [ ] On narrow windows the list is shown first and selecting an item shows its editor, with a way back to the list.

### 6.3 Status panel
As Naresh, I want to see whether everything is working, and be told when it isn't.
- [ ] The Sources tab starts with a Status panel listing every feed, every Gmail source, the Gmail connection, the agent service, whisper-server and the backup.
- [ ] Each row shows: name and kind, last checked, last success, and a status of **OK**, **Failing** (with the latest error message) or **Off** (disabled source, linking off, Gmail not connected).
- [ ] A source that has never succeeded shows "never" for last success.
- [ ] Opening a failing row shows its last 5 errors with their times.
- [ ] The Gmail connection row says plainly when the token has been revoked or expired, with a **Reconnect** action.
- [ ] The service rows (agent service, whisper-server) are checked when the panel is open and every few minutes in the background. A service that isn't reachable shows as **Failing** whenever it is down, whether or not a job needs it right now.
- [ ] When any row is Failing, the drawer's Settings item shows a warning badge, with an accessible label saying how many things are failing. Not shown by colour alone.
- [ ] The existing per-feed and per-source "last checked" and error lines stay as they are.

### 6.4 Database backups
As Naresh, I want a recent copy of my data outside Docker.
- [ ] Backups are manual only: **Back up now** in the Status panel writes a consistent copy of the database to a backups folder on the host (`~/mnemosyne-backups`, set in `.env`), while the app keeps running. There is no schedule.
- [ ] Backup files are named by date and time. The app never deletes backups; Naresh removes old ones himself.
- [ ] The backup row shows when the last backup ran (or "never") and its size. It is **OK** after a successful backup, **Failing** if the last attempt failed, and is never marked failing just because a backup is old.
- [ ] While a backup is running, the button is disabled and shows progress; when it finishes, the panel shows the result.
- [ ] Backups contain the database only. The Gmail token in it is encrypted, so restoring the Gmail connection also needs `TOKEN_ENCRYPTION_KEY` from `.env`. **The key is never written to the backups folder.**
- [ ] `docs/` gets a restore guide: stop the app, replace the database from a backup, start it, and what to do if the encryption key is lost (reconnect Gmail).

### 6.5 One job lifecycle
As a developer, I want the job states and the moves between them defined in one place.
- [ ] All job statuses and the allowed moves between them (and which states expire, retry and how) are defined once, in code, and documented in an ADR with a diagram.
- [ ] Every status change goes through that definition. A move it doesn't allow is refused and logged, instead of written to the database.
- [ ] Video, article, feed-item and newsletter jobs, and linking, all follow it. Their behaviour is the same as 0.7.0.

### 6.6 Structured logs
As a developer, I want to follow a job through the logs, across both services.
- [ ] The server and the agent service write one JSON object per log line, with a level and a time.
- [ ] Every log line about a job carries its job ID; a link run carries it into the agent service's logs too.
- [ ] Poller, sweeper, backup and HTTP errors are logged with the source or route they belong to.
- [ ] No secrets, tokens, email bodies or note text in the logs.

### 6.7 End-to-end smoke test
As a developer, I want one command that proves the whole stack works.
- [ ] One command builds and starts the full Compose stack with test settings and runs a browser test against it.
- [ ] The test covers: submit an article URL, see it summarize and link, accept a suggested link, save, and find the note in a temporary vault folder; and add a feed, see its items in the inbox.
- [ ] Nothing in it touches the network or a real vault: pages, feeds, Claude and Whisper are served by local fakes.
- [ ] It isn't part of the per-task test run (it's slow); it runs at the end of each checkpoint and before a release.

### 6.8 Dependency refresh
- [ ] All dependencies in every app are updated to their current versions, and everything passes tests, lint and typecheck.
- [ ] Any major upgrade that needs code changes beyond a few lines is listed in the TRD, and deferred if it's large.

## 7. Constraints
- Single user, local, as before.
- The backups folder is mounted into the app container only. The agent service never sees it.
- The tab and selected-prompt state live in the address, not in storage.
- New dependencies only as named in the TRD.
- Tests never touch the network or a real vault.

## 8. Out of scope (KIV)
- Off-machine backup destinations (cloud storage) and backing up the vault itself.
- Notifications outside the app (email or push) when something fails.
- A spend summary built on recorded usage.
- Claude API Workload Identity Federation.
- Business-idea validator; AI tutor; job-alert intake (ADR 0041).

## 9. Open questions
None.

Decided while drafting:
- Settings tabs: Prompts, Models, Sources; no General tab. `/settings` opens Prompts.
- Prompts tab: list on the left, editor on the right.
- The Status panel is part of this release, on the Sources tab, with a warning badge on the drawer's Settings item.
- Backups are manual (**Back up now**), to `~/mnemosyne-backups`, kept until Naresh deletes them. The encryption key is never written there.
- whisper-server and the agent service show as Failing whenever they are down.
- The smoke test covers the article and feed paths only; no video path.
