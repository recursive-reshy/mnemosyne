# 0059. Study profile and per-profile folder memory

- Status: Accepted
- Date: 2026-10-22

## Context
Course material reaches Melete mostly through Mnemosyne: YouTube videos and articles summarized into subject folders. The seeded profiles (business, coding, general) pull out takeaways, not what a quiz needs. And the folder picker always starts on `DEFAULT_NOTE_FOLDER` (ADR 0022), so working through a subject means choosing the same folder for every note.

## Decision
- A seeded **Study** summary profile (`seed_key 'study'`), editable and versioned like the others, that summarizes for learning: concepts and definitions, how and why, steps, examples, common mistakes. The locked instructions and note shape don't change.
- **`prompt_profiles.last_folder`:** when a note is saved, the folder it went to is remembered for the job's prompt profile, after the write succeeds.
- **`Job.default_folder`:** for a job in review, the profile's `last_folder` when it still exists in the vault, else `DEFAULT_NOTE_FOLDER`. The picker starts there and the save uses it when no folder was picked. A pick still applies to that note only.

## Consequences
- A run of Study videos lands in the current subject's folder without re-picking; business and coding notes keep their own defaults.
- One more vault `stat` when assembling review jobs.
- Changes ADR 0022's "always reverts to the default" rule: it now reverts to the profile's last folder.

## Alternatives considered
- **A fixed default folder per profile:** doesn't work for Study, which spans every subject.
- **Remember the last folder globally:** business notes would follow study notes into subject folders.
