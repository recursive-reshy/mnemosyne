# Backups and restore

Mnemosyne keeps everything except your vault in one SQLite database, `mnemosyne.db`, on the Docker volume `mnemosyne_mnemosyne-data` (the volume `mnemosyne-data` in `docker-compose.yml`, prefixed with the Compose project name, which is the folder name `mnemosyne`). A backup is a copy of that file in a folder on your Mac.

## What is and isn't backed up

In the backup: jobs and their drafts, prompt profiles and their history, settings, feeds, Gmail sources, the inbox, usage and cost records, link suggestions, health history and the Gmail connection (the refresh token, encrypted).

Not in the backup:

- **The vault.** Notes you saved live in your Obsidian vault; back that up the way you already do.
- **`.env`.** It holds your API key, `AGENT_SECRET` and `TOKEN_ENCRYPTION_KEY`. Keep a copy in a password manager. The key is deliberately never written to the backups folder, which may be cloud-synced: a key next to the encrypted token would undo the encryption.

## Taking a backup

1. Set `BACKUP_HOST_PATH` in `.env` to an absolute folder on your Mac, for example `/Users/<you>/mnemosyne-backups`. Compose refuses to start without it. The folder is mounted into the app container (not the agent) at `/backups`.
2. Open **Settings → Sources** and click **Back up now** on the Backups row. The app keeps running. The row shows the file name and size, and the Status panel marks the row Failing only if the last attempt failed, never because the last backup is old.

Files are named `mnemosyne-YYYYMMDD-HHmmss.db` in Singapore time (no colons). Each is a single, self-contained database file that was checked with SQLite's `PRAGMA quick_check` before it got its final name; a half-written copy is named `….partial` and removed if the check fails. The app never deletes a backup, so delete old ones yourself. To keep copies off this machine, point `BACKUP_HOST_PATH` at a folder that something else syncs.

Only one backup runs at a time; a second click while one runs is refused with "A backup is already running".

## Restoring

Restoring is a manual step, done with the app stopped. Pick the backup file you want (below, `mnemosyne-20261022-180500.db`) and your backups folder (`/Users/<you>/mnemosyne-backups`):

```bash
cd ~/path/to/mnemosyne
docker compose down
docker run --rm \
  -v mnemosyne_mnemosyne-data:/data \
  -v /Users/<you>/mnemosyne-backups:/backups:ro \
  alpine sh -c '
    rm -f /data/mnemosyne.db-wal /data/mnemosyne.db-shm &&
    cp /backups/mnemosyne-20261022-180500.db /data/mnemosyne.db &&
    chown 1000:1000 /data/mnemosyne.db'
docker compose up -d
```

- The two `rm` targets are the database's write-ahead log and shared-memory files. They must go, or the old log would be replayed onto the restored file.
- `chown 1000:1000` gives the file to the `node` user the app runs as. Without it the app can't write to the restored database.
- Before replacing anything, take one more backup of the current state first if the app still starts, in case you restore the wrong file.
- `docker compose down` does not delete the volume; do not add `-v`.

If the volume name differs on your machine, `docker volume ls` shows it.

## Versions

- A backup from an **older** version of Mnemosyne is migrated forward when the app starts.
- A backup from a **newer** version is refused: the server logs "This database is from a newer version of Mnemosyne (schema N, this version knows M). Restore an older backup or upgrade the app." and exits without touching the file.

## If `TOKEN_ENCRYPTION_KEY` is lost or changed

The restored database can't decrypt the Gmail token, so the Gmail connection shows as **Failing** in the Status panel. Click **Reconnect** (or Connect Gmail in Settings → Sources) and approve access again. Nothing else is affected: your sources, inbox, jobs and settings are intact.
