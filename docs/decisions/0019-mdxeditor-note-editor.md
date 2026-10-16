# 0019. MDXEditor for the note editor

- Status: Accepted
- Date: 2026-10-16

## Context
0.2.0 edits the summary in a raw Markdown textarea. Naresh wants it to feel like Obsidian: a rendered (WYSIWYG) view by default, with a toggle to raw source. The note must reach the vault unchanged, including `[[wikilinks]]` that a later vault-aware agent will add.

## Decision
- Use **`@mdxeditor/editor`** with `diffSourcePlugin` (rich text ↔ source toggle) and `frontmatterPlugin`.
- Front-matter is edited through our own `PropertiesPanel` in rich mode; MDXEditor's front-matter UI stays hidden.
- Round-trip fidelity is tested against real 0.2.0 summaries and wikilink fixtures. If MDXEditor fails them, work stops for a decision rather than a workaround.

## Consequences
- The rich/source toggle comes built in, so little custom editor code.
- A heavier dependency with its own CSS, and it normalizes Markdown in ways we don't fully control; the round-trip tests are the guard.
- Caret sync has to be re-done against MDXEditor's selection instead of a textarea.

## Alternatives considered
- **Milkdown:** Markdown-first, likely cleaner round-trips, but the toggle and front-matter handling would be built by hand.
- **TipTap:** most flexible, but rich-text-first with Markdown as an add-on, so the weakest round-trip.
- **A time-boxed spike first:** Naresh chose to commit to MDXEditor and rely on the tests.
