# 0023. MDXEditor round-trip contract

- Status: Accepted
- Date: 2026-10-16
- Amends: 0019

## Context
ADR 0019 chose MDXEditor and required notes to round-trip unchanged. Task 6.1's tests (MDXEditor 4.3.3, seven fixtures) showed it escapes `[[wikilinks]]` and plain `[12:34]` timestamps (`\[\[…]]`, `\[12:34]`), writes `*` for `-` bullets, and drops the trailing newline. Front-matter, headings, quotes, links, bold/italic, code and rules survive. Naresh decided to keep MDXEditor and change the contract instead of post-processing its output as strings.

## Decision
- **Round-trip contract.** Loading a note and exporting it may normalize it once. Export → load → export is identical (idempotent). Wikilinks, timestamps (both forms), front-matter, quotes and links survive exactly. This replaces the "byte-identical" requirement in TRD §6.1 and §8 until the TRD is updated.
- **Wikilinks.** `[[Note]]` and `[[Note|alias]]` are written verbatim by a small local to-markdown extension in `apps/web` that overrides the `text` handler: wikilink spans are emitted as they are and everything else goes through `state.safe`, as before. No new dependency: the only maintained package found, `mdast-util-wiki-link`, targets micromark 2, while MDXEditor uses micromark 4 and `mdast-util-from-markdown` 2. In rich mode a wikilink is plain text, not a node or chip; a node can be added later without changing the stored note.
- **Plain timestamps.** For non-YouTube sources `summary.formatter` writes `(12:34)` instead of `[12:34]`, so nothing needs escaping. `parseTimestampSeconds` accepts a bare `h:mm:ss` / `mm:ss` as well as the bracketed form, because in rich mode a YouTube timestamp's text is just `12:34`. Existing notes keep their old form.
- **Bullets and rules.** `toMarkdownOptions.bullet` is `-` and `rule` is `-`, so `---` stays `---` (MDXEditor otherwise writes `***`). A `*` bullet typed in source mode becomes `-` after the next export.
- **Unsupported Markdown.** The editor registers headings, lists, quotes, links, rules, front-matter and code blocks. Markdown it cannot import (tables, images, HTML, JSX) makes MDXEditor report an error and echo the input; `NoteEditor` must treat `onError` as "use source mode", never as a successful round-trip.
- **Trailing newline.** `NoteEditor`'s `onChange` always ends the note with exactly one `\n`.
- Anything else that MDXEditor escapes or rewrites stops work for a decision.

## Consequences
- The vault gets the text the user saw in source mode, apart from `*` → `-` and the final newline.
- The wikilink handler is ours to maintain if `mdast-util-to-markdown` changes its handler API.
- A bare `12:34` anywhere on a line now counts as a timestamp for caret sync.

## Alternatives considered
- **String post-processing of MDXEditor's output:** fragile and hides real escapes.
- **A micromark syntax extension, mdast node, Lexical node and visitors:** gives chips in rich mode but needs a tokenizer and a type-only dependency for a result the stored note can't show.
- **Switching to Milkdown or TipTap:** a new ADR and TRD changes for a problem that two small changes solve.
