# 0072. The learning root is created on save in Settings

- Status: Accepted (amends ADR 0054)
- Date: 2026-10-28

## Context
ADR 0054 says knowledge modules share the vault read-only: only Mnemosyne's ingest pipeline writes to it, and Melete reads notes and never writes, renames or annotates them. In line with that, the Melete learning-root setting validates its folder with `resolveExistingFolder`, which creates nothing.

The learning-root dialog reuses the vault-wide folder picker (ADR 0022). That picker offers **New folder**, which only marks a folder as new on the client; the review screen's save creates it with `resolveFolder`. Manual testing of 0.9.0 showed the mismatch: picking a new folder as the learning root fails with "Folder doesn't exist in the vault". A new user with an empty vault, the first thing Naresh's brother meets, cannot set Melete up without leaving the app to make a folder in Obsidian or Finder.

Two fixes were considered: create the folder when the setting is saved, or hide **New folder** in that dialog.

## Decision
- **Saving the learning root creates the folder.** `updateSettings` validates `melete_learning_root` with `resolveFolder`, the same confined `mkdir -p` the review screen's save uses: the path must parse, must stay inside the user's vault, and is re-checked after creation. An existing folder is accepted as before. A path whose last segment is a file is refused with a 400.
- **The exception is this one explicit action.** The folder is created because the user chose a name in Settings and pressed Save, exactly as a note folder is created because the user pressed Save on a note. Melete's scan, generator loop, grading and review keep `resolveExistingFolder` and never write, rename or annotate anything in the vault. A guard test keeps the settings service the only importer of `resolveFolder` (the job save reaches it through `writeNote`), and no Melete module.
- **ADR 0054 is amended, not replaced.** Its rule reads: knowledge modules share the vault read-only; the only vault writes are the note save in the ingest pipeline and the empty learning-root folder a user creates from Settings. Everything else in ADR 0054 stands.

## Consequences
- A new user sets Melete up without leaving the app; the folder appears in Obsidian at once, empty, and gains subjects as they add folders under it.
- One more code path can create a folder in the vault, bounded by the same confinement checks as the save and reachable only through a user's own PATCH of their own settings.
- A typo in the dialog creates an empty folder the user then deletes in Obsidian. Accepted: the name was theirs, and the picker shows the tree before saving.
- The root `CLAUDE.md` sentence "Melete never writes to the vault" gains the exception.

## Alternatives considered
- **Hide "New folder" in the learning-root dialog.** No write, but it leaves the first-run dead end in place and makes the shared picker behave differently in two places.
- **Create the folder on the first scan instead.** Moves the write into Melete's read-only loop, which is exactly what ADR 0054 forbids, and hides when the write happens.
- **Create the folder client-side through the save route of a dummy note.** Absurd coupling to the ingest pipeline.
