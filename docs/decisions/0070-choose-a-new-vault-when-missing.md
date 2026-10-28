# 0070. A user can choose a new vault when their folder is missing

- Status: Accepted
- Date: 2026-10-28

## Context
ADR 0063 stores a user's vault as `users.vault_dir` and lets only the admin reset it. Manual testing of 0.9.0 (task 8.4) showed what happens when the folder is later deleted, renamed or unmounted: `vaultRootFor` only checks that `vault_dir` is set, so the folder tree, save, linking and Melete reach the disk and fail with ENOENT, which is a 500. `GET /api/me` still reports the vault, so the web gate lets the user into the app, and the claim and create routes refuse them with "You already have a vault". The admin cannot reset their own vault (self-targeting is refused, ADR 0067), so the only way out is editing the filesystem or the database.

## Decision
- **Detection.** `vaultRootFor` checks, with one synchronous `lstat`, that `VAULTS_PATH/<vault_dir>` is a real directory (not missing, not a file, not a symlink). Otherwise it throws `VaultMissingError`, a `ConflictError`: 409 "Your vault folder is missing". Every caller gets this without changes. The message is a shared constant, `VAULT_MISSING_MESSAGE`.
- **Contract.** `Me` gains `vault_missing: boolean`, set by `getMe` with the same check. `vault_dir` keeps the old name, so the page can say which folder is gone.
- **Re-choosing.** A user whose vault is missing, admin or member, may claim or create a vault through the existing routes (`GET /api/me/vaults`, `POST /api/me/vault`, `POST /api/me/vault/new`). The update is compare-and-set on the old `vault_dir`, so two concurrent re-choices cannot both win; the unique column still decides claim races. Creating a folder with the missing vault's own name is allowed (it recreates it).
- **Unchanged from ADR 0063.** A user whose vault exists cannot change it; only the admin resets someone else's. Self-reset by the admin stays refused. Claimed folders are never listed, and the confinement checks stand.
- **Web.** The gate shows `ChooseVault` when `vault_dir` is null or `vault_missing` is true, with a notice naming the missing folder. A 409 carrying `VAULT_MISSING_MESSAGE` invalidates the `me` query, like a 401, so a folder that vanishes mid-session reaches the gate on the next failed call.
- **Loops.** `eligible_users` is SQL and cannot look at the disk, so it is unchanged. Work for a missing-vault user fails where it touches the vault: linking ends in review with the link error "Your vault folder is missing" (the path used for "Choose a vault first"), a Melete scan answers 409, and a note whose text can't be read fails with a reason. Nothing is deleted. Melete marks missing notes and restores them if the path or body reappears (ADR 0057).

## Consequences
- Amends ADR 0063 ("only the admin can reset a user's vault") and TRD §2.1 (the `Me` contract).
- No 500 and no filesystem or database edits to recover.
- One `lstat` per vault operation and per `GET /api/me`.
- A user can end up pointing at a different vault after losing the old one. That is the recovery; the unique column still stops them taking someone else's.
- Queued work for a missing-vault user fails at the point of use and is retryable once they choose again.

## Alternatives considered
- **Let the admin reset their own vault:** widens a safety rule for one case and would let the admin swap a working vault by accident.
- **Report `vault_dir: null` for a missing vault, with no contract change:** `Me` would disagree with the database, the page could not name the missing folder, and the state could flip back without a visible reason.
- **Clear `vault_dir` automatically when the folder disappears:** hides the problem, and a briefly unmounted drive would silently drop the claim.
- **Let any user change their vault at any time:** contradicts ADR 0063.
