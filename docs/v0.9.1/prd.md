# Mnemosyne v0.9.1 — Product Requirements

## 1. Summary
v0.9.1 is a small patch release after 0.9.0's manual testing, before the cloud move (0.10.0). It fixes three things people meet while using the app: choosing a learning root that doesn't exist yet, a vault with a folder the app can't read, and the "Open in Obsidian" link pointing at one vault for everyone. Nothing else changes: sign-in, vaults, jobs, summaries, linking, Melete's scheduling and the admin area behave as in 0.9.0, and the database schema is unchanged.

## 2. Background
Manual testing of 0.9.0 (task 8.4) found four problems. Two were fixed inside 0.9.0 itself (a missing vault folder is now a 409 and the user, admin included, chooses a vault again; ADR 0070). The other two remain, plus one known issue the 0.9.0 release notes carried:

- **A new learning root can't be created from Settings.** The folder picker shared with the review screen offers **New folder**, and the review screen creates that folder when the note is saved. The Melete learning-root setting only checks that the folder exists, so picking a new one fails with "Folder doesn't exist in the vault". A new user with an empty vault has to leave the app, make the folder in Obsidian or Finder, and come back.
- **One unreadable folder breaks the whole tree.** The folder picker and the Melete scan read the vault folder by folder; a subfolder the app can't enter (permissions, a folder removed mid-read, a mount that vanished) turns into "Internal Server Error" for the picker and a failed scan for Melete.
- **"Open in Obsidian" uses one vault name for everyone.** `OBSIDIAN_VAULT_NAME` is app-wide, so the link only matches one person's vault (0.9.0 release notes, known issues). Since 0.9.0 each person's vault is its own folder, and Obsidian names a vault after its folder, so the app already knows each person's vault name.

## 3. Goals
- A user can choose a learning root that doesn't exist yet and the app creates it.
- A folder the app can't read never breaks the picker or the scan: it is skipped, logged, and the user is told.
- "Open in Obsidian" opens the right vault for every user, with nothing to configure.

## 4. Non-goals
- No change to the folder picker's look or behaviour beyond the above. No native folder dialog (the picker chooses a folder on the server, which is not the device showing the page).
- No change to how Melete schedules, generates or grades, and no new vault writes by Melete's loops or reviews.
- No schema change and no data migration.
- Nothing from the cloud move: hosting, the vault mount, whisper-server, backups off the machine.

## 5. User flow
1. A user with the Melete module opens **Melete** for the first time and is asked to choose a learning root. The picker shows their vault's folders. They pick an existing folder, or choose **New folder**, name it, and save. The folder now exists in their vault (empty, visible in Obsidian) and Melete shows it with no subjects yet.
2. A user whose vault has a folder the app can't read opens the folder picker (review screen or learning root). The tree shows every folder it could read; the unreadable one is missing from the tree and noted in the server log.
3. The same user opens **Melete**. The scan reads what it can. Notes it could read are updated as usual; notes inside a folder it couldn't read are left exactly as they were (not marked missing, their questions stay in review). The Melete page shows a notice naming the folders or notes that couldn't be read, until a later scan reads them.
4. A user reviewing a Melete note or question clicks **Open in Obsidian**. Obsidian opens *their* vault at that note. Nothing to set up; the `OBSIDIAN_VAULT_NAME` line in `.env` is no longer read.

## 6. Features

### 6.1 Create the learning root on save
As a user setting up Melete, I want to choose a folder that doesn't exist yet.
- [ ] In the learning-root dialog, **New folder** works: saving creates the folder in the user's vault and sets it as the learning root. An existing folder is accepted as today.
- [ ] The folder is created only by this explicit save in Settings; Melete's scan, generator and review still never write to the vault (ADR 0072 amends ADR 0054 for this one case).
- [ ] A name that is outside the vault, invalid, or already taken by a file is refused with the same kind of message the review screen's picker gives.
- [ ] After saving a brand-new root, Melete shows the root with no subjects, and a folder added under it later appears as a subject on the next scan, as today.

### 6.2 Skip what can't be read
As a user, I don't want one bad folder to take the app down.
- [ ] **Folder picker:** a subfolder that can't be read (no permission, gone between listing and reading, not a directory any more) is left out of the tree; the rest of the tree loads. The server logs one warning line per skipped folder with the user ID and the folder's path in the vault, never note text.
- [ ] **Melete scan:** a folder or note that can't be read is skipped and the scan completes. Notes under a skipped folder, and skipped notes, are left untouched: not marked missing, not treated as moved, questions unchanged. Notes the scan could read are updated as usual.
- [ ] The Melete page shows a warning listing the vault paths the last scan couldn't read. The notice disappears once a scan reads them.
- [ ] A vault whose root folder itself can't be read is still an error (as the missing vault is), not a silently empty tree.

### 6.3 "Open in Obsidian" per user
As a user, I want the link to open my vault.
- [ ] The Obsidian link on Melete notes and review items uses the user's own vault folder name, so it opens their vault in Obsidian.
- [ ] `OBSIDIAN_VAULT_NAME` is removed. A leftover line in `.env` is ignored and logged as a warning at startup, like `GOOGLE_REDIRECT_URI` and `VAULT_PATH` since 0.9.0.
- [ ] The README, `.env.example` files and release notes say so; the 0.9.0 known issue is closed.

## 7. Constraints
- No new dependencies.
- No schema change: `SCHEMA_BASE` and the migrations list are untouched.
- Tests never touch the network, Google, the Claude API or a real vault. Permission tests use a temporary folder and are skipped where the test process runs as root (root ignores permission bits).
- Every path logged is a vault-relative folder or note path; no note text (ADR 0049).

## 8. Out of scope (KIV)
- Everything planned for 0.10.0: the GCP VM, obsidian-headless per user, a transcription API in place of whisper-server, Litestream, Secret Manager, yt-dlp cookies and proxy.
- A per-user Obsidian vault name setting, for someone who opens Obsidian at a folder other than their vault. Add it if the case ever appears.
- Finder-like picker improvements (filter box, breadcrumbs, column view).

## 9. Open questions
None.

Decided while drafting:
- The native macOS folder dialog is out: the picker chooses a path on the server, browsers don't expose native paths, Safari and iOS lack the directory-picker API, and the server moves off the Mac in 0.10.0.
- The learning root is created on save (option A), under ADR 0072, rather than hiding **New folder** in the learning-root dialog.
- The scan protects notes under an unreadable folder (option 2b) rather than letting them flip to missing, and reports the skipped paths on the Melete page.
- The Obsidian vault name is derived from `users.vault_dir` and the environment variable is retired, recorded in the TRD and release notes rather than an ADR.
