# 0044. Wikilinks: links only from the new note, concept links, text-tool search and computed kinds

- Status: Proposed
- Date: 2026-10-21

## Context
The linking agent proposes `[[links]]` for each new note. Naresh is wiping the vault before v0.7.0, so linking starts from nothing. With only existing notes as targets, the first dozen notes would have almost nothing to link to. Letting a model invent link targets risks near-duplicates (`[[Pricing]]`, `[[Pricing strategies]]`) and a messy graph.

## Decision
- **Links go only into the new note.** Existing notes are never edited; Obsidian shows backlinks itself.
- **Three kinds of target:** an existing note, an existing concept (a target already used in some `[[link]]` with no note behind it) and a new concept. No stub files are created; concepts stay unresolved until Naresh writes the note.
- **Reuse before invent.** The agent sees every existing link target with its use count and must reuse one when it fits. New concepts are Title Case, singular, short noun phrases.
- **The kind is computed, not trusted.** After the model submits, code matches each target case-insensitively against note titles (existing note) and existing link targets (existing concept), else new concept, and rewrites the target to the existing casing.
- **Placement:** an anchor phrase that appears verbatim in the note becomes an inline link at its first eligible occurrence; a relevant concept not named in the text goes in a `## Related` list at the end. An anchor that isn't found verbatim is turned into a Related suggestion, not dropped.
- **At most 8 suggestions,** no self-links, no duplicate targets.
- **Text tools, no embeddings:** `list_notes`, `search_vault` (plain Python, case-insensitive terms), `read_note`, `list_link_targets`, and a terminal `submit_suggestions` tool whose input is validated with Pydantic (one corrective turn on failure).
- **Limits from settings:** 12 turns, 24 tool calls, 4096 output tokens per call, a 90-second run timeout (Express waits 120). Tool results are capped (500 notes, 20 search hits of about 200 characters, 8,000 characters per note, 500 link targets). Prompt caching on the system prompt and tools.
- Any limit hit, timeout or invalid submission is a `failed` outcome with a reason that gives the numbers.

## Consequences
- The graph grows from the first note, with consistent concept names.
- The vault is never at risk from the linker.
- Text search is enough to the low thousands of notes; embeddings can sit behind `search_vault` later without changing the contract.
- Notes still in review can't link to each other (the agent only sees saved notes).

## Alternatives considered
- **Existing notes only:** safe, but an empty vault gives nothing to link to for weeks.
- **Writing backlinks into existing notes:** redundant with Obsidian's backlinks pane and risky for files Mnemosyne didn't create.
- **Stub concept notes:** fills the vault with empty files Naresh didn't ask for.
- **Embeddings now:** an index is state to keep in sync, against the stateless service, for a vault of a few notes.
- **The model returns rewritten Markdown:** risks silent changes to the summary and can't be reviewed link by link.
