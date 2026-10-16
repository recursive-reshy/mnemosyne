# 0022. Vault-wide folder picker, writes confined to the vault

- Status: Proposed
- Date: 2026-10-16

## Context
0.2.0 writes every note to a fixed `Mnemosyne/` folder. Naresh wants to choose any folder in the vault per note, including new ones, with the default restored for every new job.

## Decision
- The default folder is configurable (`DEFAULT_NOTE_FOLDER`, default `Mnemosyne`), vault-relative, created at startup if missing.
- `GET /api/vault/folders` returns the whole folder tree in one response, skipping dot-folders and not following symlinks.
- The chosen folder is stored per job in `target_folder` (null = default) as part of the draft. New folders are created only when the note is saved.
- Every folder path is validated with shared rules, resolved against the vault root, and checked with `realpath` before and after `mkdir`, so no write can leave the vault.

## Consequences
- The container could write anywhere in the vault (it already mounts the root); the path checks keep writes where Naresh chose.
- The picker can filter the whole tree client-side.

## Alternatives considered
- **Lazy loading one level at a time:** suits huge trees or slow mounts; a local vault is neither, and it makes search harder. Easy to switch later.
- **Only subfolders of the default folder:** too restrictive.
- **Remember the last-used folder:** Naresh wants every job to start on the default.
