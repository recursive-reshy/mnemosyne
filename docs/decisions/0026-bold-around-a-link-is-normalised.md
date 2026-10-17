# 0026. Bold around a link is normalised to link around bold

- Status: Accepted
- Date: 2026-10-17
- Amends: 0023

## Context
Task 7.3 added a toolbar fixture and ran it through the ADR 0023 round-trip test. Every construct the toolbar can write (`#`–`###`, `>`, `**bold**`, `*italic*`, `***both***`, `-` and `1.` lists, links, and these inside quotes and lists) comes back exactly, and `####`–`######` headings survive. One hand-typed form does not: bold wrapped around a link, `**[text](url)**`, is written back as `[**text**](url)`.

The toolbar never produces the first form. Formatting a link's text in rich mode puts the bold inside the link, which is already the second form.

## Decision
- **Bold around a link is normalised once.** `**[text](url)**` in a note becomes `[**text**](url)` after the first export. Export → load → export is identical, so this fits the "normalize once, then idempotent" rule in ADR 0023.
- The two forms render the same in Obsidian: a bold link.
- The behaviour is pinned by a fixture ("bold around a link") in the normalising list of `noteRoundTrip.test.tsx`, next to `*` bullets.
- Anything else MDXEditor rewrites still stops work for a decision, as in ADR 0023.

## Consequences
- A note typed in source mode with bold around a link changes its Markdown, not its look, the first time the editor exports it.
- No code is needed: the behaviour is MDXEditor's, and we accept it.

## Alternatives considered
- **String post-processing to restore `**[text](url)**`:** fragile, and rejected for the same reasons as in ADR 0023.
- **Treating it as a failure and stopping:** the two forms mean the same thing, and the toolbar cannot produce the changed one.
