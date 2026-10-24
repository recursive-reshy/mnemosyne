# Mnemosyne v0.9.0 — Product Requirements

## 1. Summary
v0.9.0 makes Mnemosyne a **multi-user** app. Naresh is the **admin**; his brother is the first **member**. Each person signs in with Google, has their own vault, their own jobs, inbox, feeds, Gmail connection, prompt profiles and Melete study data, and sees only the modules the admin has switched on for them. The admin manages users and module access, and sees each user's usage and cost, from a new **Admin** area in Settings. Nothing about how summarizing, linking, reviewing or studying works changes. The app still runs on Naresh's Mac; moving it to a cloud VM is v1.0, and 0.9 is the groundwork that makes that move a deployment rather than a redesign.

## 2. Background
Through 0.8, Mnemosyne assumes one person. There is no login; Tailscale and `localhost` are the only wall. Every table, setting and vault path belongs implicitly to Naresh.

Naresh wants to move the app off his Mac to a GCP VM (v1.0) so it no longer depends on the Mac being on and awake, and he wants his brother to use it. Doing multi-user first, locally, keeps two hard changes apart: data-model bugs are found on the Mac with the existing setup, and the cloud move then ships an app that is already correct. There is almost no data yet, so this is the cheapest moment to give everything an owner.

Decided while scoping the cloud move (recorded here so 0.9 doesn't undo them):
- The app stays on **SQLite**; no Postgres. A single VM is the long-term host and scaling is vertical; Cloud Run is not a target.
- In v1.0, each user's vault is kept in sync by the official **Obsidian Headless** client (one per user), whisper-server is replaced by a hosted transcription API, backups go to object storage, and access stays private over **Tailscale**.

## 3. Goals
- Naresh's brother can use Mnemosyne with his own notes, without seeing Naresh's data or Naresh seeing his.
- Naresh decides which modules his brother gets, in one place, without touching config files.
- Naresh can see what each user's Claude and transcription use costs him.
- Everything that works today for Naresh keeps working, with his existing data intact.
- Nothing added in 0.9 ties the app to the Mac, so v1.0 is a deployment.

## 4. Non-goals
- **No cloud hosting.** v1.0. The brother can reach the app over Tailscale while the Mac is on, but that isn't a goal.
- **No admin access to another user's content.** The admin sees users, module access and usage totals; never their jobs, notes, inbox, feeds, prompts or study data.
- No sharing between users: no shared notes, feeds, prompt profiles or study subjects.
- No self-sign-up. Only Google accounts the admin has added can sign in.
- No passwords, password reset or email sending.
- No spend caps, no per-user model restrictions and no per-user API keys. All users use the app's Claude and transcription keys, and the admin pays.
- No feature-level toggles inside a module (e.g. Gmail separately from feeds).
- No more than one admin, and no roles beyond admin and member.
- No change to summarizing, linking, review, saving or Melete behaviour.

## 5. User flow
1. **First run after upgrade.** The old database is copied to the backups folder and the app starts empty. Naresh signs in with Google as the admin email set in `.env`, chooses his vault (the existing one, moved under the vaults folder), and re-adds his feeds, Gmail and prompt edits.
2. **Add a user.** In **Settings → Admin**, Naresh adds his brother by Google email and name, and switches on the modules he should have (e.g. Transcriber and Melete).
3. **Brother signs in.** He opens the app and signs in with Google. On his first sign-in he chooses his vault: a folder under the vaults folder that no one else has claimed, or a new empty one. He then lands on the first module he has. The drawer shows only his modules; Settings shows only the tabs that apply to him.
4. **Brother sets up.** He gets the seeded prompt profiles as his own copies, connects his own Gmail, adds his own feeds, and sets his learning root in his own vault. None of this is visible to Naresh.
5. **Day to day.** Each person's jobs, inbox, review queue, saves and Melete reviews are theirs alone. Saves go to the signed-in user's vault.
6. **Admin oversight.** Naresh opens **Settings → Admin** to see each user's usage and estimated cost this month and in total, and changes module access or removes a user when needed.

## 6. Features

### 6.1 Sign-in
As a user, I want to sign in with my Google account.
- [ ] Every page and API route except sign-in requires a signed-in user.
- [ ] Sign-in is **Sign in with Google**. Only Google accounts the admin has added (by email) can sign in; anyone else sees a plain "not allowed" page.
- [ ] Sessions last long enough that a user on their own phone or Mac isn't asked again for weeks; **Sign out** is in the drawer.
- [ ] Before any user exists, the first Google account to sign in becomes the admin, and only if its email matches an admin email set in `.env`. No one else can claim admin.
- [ ] Sign-in works at `localhost` and at the private Tailscale address.
- [ ] Background work (feed and Gmail polling, the worker, Melete's generator loop) keeps running for every user whether or not they are signed in.

### 6.2 Users and roles
- [ ] Two roles: **admin** (one, Naresh) and **member**.
- [ ] The admin can add a member (Google email, display name, modules), change a member's modules, reset a member's vault choice, and remove or restore a member.
- [ ] Removing a member signs them out at once, stops them signing in and stops their background work. Their data is kept, and **Restore** brings them back as they were. A removed member can be deleted with **Delete user**, which asks for their email to confirm and deletes them and all their data. Their vault folder is never touched.
- [ ] The admin can't remove or demote themself.

### 6.3 Module access
As admin, I want to choose which modules each user gets.
- [ ] Modules are **Transcriber** (submitting videos and articles, the inbox, feeds, Gmail, review and save) and **Melete**. Future modules join the same list.
- [ ] Each member has each module on or off. The admin always has every module.
- [ ] A module that's off is absent from the drawer and its pages, and its API routes refuse that user. Its background work doesn't run for them.
- [ ] Turning a module off hides its data; turning it back on brings it back as it was.
- [ ] A member with no modules on sees a page saying so after sign-in.

### 6.4 Data ownership
- [ ] Every job, inbox item, feed, Gmail source and connection, prompt profile and version, summary and link run, setting, backup record and Melete record belongs to exactly one user.
- [ ] Users only ever see, change or delete their own data, in every page and API route. The admin is no exception for content.
- [ ] Polling, the worker, linking and Melete's generator use the owning user's settings, prompts, Gmail connection and vault.
- [ ] Each user gets their own copies of the seeded prompt profiles (summary profiles including Study, the linker prompt, Melete's question and grading prompts), editable and versioned independently.

### 6.5 Vaults
- [ ] Each user has their own vault: a folder directly under one vaults folder that the app can see.
- [ ] On their first sign-in, before anything else, a user chooses their vault: an existing folder no other user has claimed, or a new empty folder they name. Folders other users have claimed are never shown or accepted.
- [ ] Only the admin can reset a user's vault choice; the user then chooses again.
- [ ] Until a vault is chosen, nothing that reads or writes the vault runs for that user.
- [ ] Saving, the folder picker, the linking agent and Melete's scans use the signed-in (or owning) user's vault only.
- [ ] A user can never read or write outside their own vault, including through the agent service.
- [ ] Naresh moves his existing vault under the vaults folder once and chooses it on first sign-in.

### 6.6 Settings
- [ ] Settings separates **my settings** (each user's own: prompt profiles, default models, feeds, Gmail, learning root and other Melete options, default folder) from **app settings** (admin only: Status panel, backups, app-wide limits).
- [ ] Members see only the Settings tabs for their modules plus their own preferences. The admin also sees **Admin**.
- [ ] The model list is the same for everyone; each user picks their own defaults from it.
- [ ] Light/dark theme and drawer state stay per browser, as today.

### 6.7 Admin area
- [ ] **Settings → Admin** lists users with email, name, role, status, modules, vault folder, last sign-in.
- [ ] For each user: usage and estimated cost for the current month and all time, split by Claude summarizing, linking, Melete (questions and grading) and transcription, from the usage already recorded per call.
- [ ] No link from the Admin area into a user's content.

### 6.8 Status and backups
- [ ] The Status panel stays admin-only and shows app services (agent, whisper-server, backups). Feed and Gmail source health is shown to each user for their own sources.
- [ ] **Back up now** stays admin-only and backs up the whole database (all users).

### 6.9 Existing data
- [ ] 0.9 starts with an empty database. Notes in the vault are untouched; database-only data (feeds, Gmail connection, prompt edits, Melete enrollment and history, usage history, unsaved drafts) is not carried over.
- [ ] On first start, the old database is copied to the backups folder before anything else and kept there; if the copy fails, the app doesn't start.
- [ ] From 0.9 on, a backup is taken automatically before any database upgrade.

## 7. Constraints
- Still runs on the Mac with the existing Docker Compose setup; reachable at `localhost` and over Tailscale only (app port bound to `127.0.0.1`).
- SQLite stays the database.
- Google sign-in uses Naresh's existing Google Cloud project; client IDs and secrets live in `.env`. Gmail access stays a separate, per-user consent from sign-in.
- One Anthropic key and one transcription setup for all users.
- No test touches the network or a real Google account; sign-in is faked in tests.
- New dependencies only as named in the TRD.
- Keep v1.0 easy: no per-user anything that assumes the Mac (paths come from settings, not code), no state outside SQLite and the vaults.

## 8. Out of scope (KIV)
- **v1.0 cloud move:** GCP e2-small VM, Obsidian Headless per user, hosted transcription API in place of whisper-server, Litestream to a GCS bucket, secrets in Secret Manager, Gmail and sign-in redirects for the new host, yt-dlp cookies/proxy for datacenter IPs.
- Per-user spend caps and model restrictions.
- Sharing notes, feeds or prompt profiles between users.
- Feature-level toggles inside a module.
- More roles, more admins, self-sign-up.
- Business-idea validator, job-alert intake (ADR 0041), wealth tracker.

## 9. Open questions
None at PRD level. The technical decisions are in `trd.md` and ADRs 0061–0068.

Decided while scoping:
- Multi-user before the cloud move, done locally.
- Naresh is admin; his brother is a member; sign-in with Google, allow-listed by email.
- Each user has their own vault, chosen by the user on first sign-in.
- Admin toggles whole modules only (Transcriber, Melete).
- Admin sees per-user usage and cost totals only; no spend caps, no model restrictions, no access to content.
- SQLite stays; the VM is the long-term host.
- Start fresh: no data migration; the old database is kept as a backup.
