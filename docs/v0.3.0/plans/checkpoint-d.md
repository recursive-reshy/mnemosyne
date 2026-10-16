# Checkpoint D plan: Phase 6 (web editor)

## Context
Checkpoint C put the review draft on the server, with a plain textarea editing the whole note. Checkpoint D swaps that textarea for MDXEditor (ADR 0019): rich text by default, a source toggle, front-matter handled through our `PropertiesPanel`, and caret sync re-done for both modes. It is the riskiest checkpoint. The note must reach the vault unchanged, so **6.1 is a gate**: if MDXEditor can't round-trip the fixtures, or can't be tested in jsdom, I stop and ask (task 6.1 and ADR 0019 say so). 6.4 has a second gate for reading the selection. TDD per task, one commit each, pushed. After each task: `pnpm test`, `lint`, `typecheck` in `apps/web`.

## What I found out about MDXEditor (Context7 was over quota, so from the official docs and npm)
- `@mdxeditor/editor` 4.3.3; peers `react >= 18 || >= 19`, so React 19 is supported. It pulls in Lexical, CodeMirror 6, Radix, `js-yaml` and the mdast/micromark family; its CSS comes from `@mdxeditor/editor/style.css`.
- `markdown` is read **only at mount**; later changes go through the ref's `setMarkdown`. `onChange( markdown, initialMarkdownNormalize )` is unthrottled and flags normalisation of the initial text. `trim` (default true) trims the initial input. `onBlur`, `onError` and `toMarkdownOptions` (mdast-util-to-markdown options, e.g. bullet) exist.
- `diffSourcePlugin( { viewMode } )` plus the `DiffSourceToggleWrapper` toolbar component give the rich ↔ source toggle. The docs show **no programmatic mode API and don't say how `markdown` / `onChange` behave in source mode**; 6.2 has to discover that with tests.
- `frontmatterPlugin()` shows a key/value form; the docs say nothing about hiding it, so hiding in rich mode will be CSS (or not rendering it) and is found out in 6.2.
- `MDXEditorMethods`: `getMarkdown`, `setMarkdown`, `insertMarkdown`, `focus`, `getContentEditableHTML`, `getSelectionMarkdown` (empty in source mode).

## Points to confirm
1. **Dependency.** `@mdxeditor/editor` is named by the TRD and ADR 0019, so it is approved; it is added in 6.1 with pnpm. I won't add anything else (CodeMirror comes with it).
2. **Gate behaviour.** If 6.1's round-trip tests fail I commit nothing, and report exactly which constructs change (e.g. `\[\[wikilink\]\]`, `*` → `-`, `[12:34]` escaped) so you can pick: tune `toMarkdownOptions`, keep the textarea for source mode only, or switch editor.
3. **ReviewScreen tests.** `NoteEditor` is mocked in `ReviewScreen.test.tsx` (it has its own tests with real MDXEditor), so those tests stay fast and don't depend on jsdom editor internals.
4. **Mode detection.** `onModeChange` is driven by MDXEditor's `viewMode$` cell read from a small toolbar child inside `NoteEditor`; if that isn't exported or reliable, I'll stop in 6.2 and ask.
5. **Panel visibility.** The `PropertiesPanel` shows above the editor in rich mode only (PRD §6.3); in source mode the YAML is in the editor itself.

## 6.1 Add MDXEditor; jsdom setup; round-trip tests (gate)
- Files: `apps/web/package.json` + `pnpm-lock.yaml`; `src/test-support/setup.ts` (jsdom stubs); `src/test-support/noteFixtures.ts`; `src/components/NoteEditor/noteRoundTrip.test.tsx`.
- Fixtures: real 0.2.0 `formatSummary` output (YouTube `[12:34](https://youtu.be/…?t=754)` stamps and plain `[12:34]` for non-YouTube), full notes with the 0.2.0 front-matter, plus hand-made cases: `[[wikilinks]]` and `[[Note|alias]]`, `*` and `-` bullets, nested lists, `> "quote" ([1:05:20](url))`, a `---` rule, inline code, a fenced code block, tags with `#`, a trailing newline or none, CRLF is out of scope.
- Tests first: for each fixture mount `<MDXEditor markdown plugins=[headings, lists, quote, link, frontmatter, markdownShortcut, diffSource] />` in jsdom with a ref and assert `ref.getMarkdown() === fixture` (byte-identical), and that `onChange` is not called with different text on mount. Red first means the file fails because the dependency or stubs are missing; the first real result then shows which fixtures fail.
- jsdom stubs (only what the editor needs, added to the setup file one at a time as tests demand): `ResizeObserver`, `Range.prototype.getBoundingClientRect` / `getClientRects`, `document.elementFromPoint`, `matchMedia`, `scrollIntoView`.
- Outcome A (all fixtures pass): commit. Outcome B (any fail, or MDXEditor can't mount in jsdom): **stop and report**, leaving the tree clean.
- If mounting is impossible but the export path works, the TRD's fallback is to test round-trip through `importMarkdownToLexical` / `exportMarkdownFromLexical`; I'd still stop and ask before skipping editor tests.

## 6.2 `NoteEditor`
- Files: `src/components/NoteEditor/` (`NoteEditor.tsx`, `.module.css`, `.test.tsx`, `index.ts`); `src/main.tsx` or the component imports `@mdxeditor/editor/style.css`.
- Props: `{ value: string, onChange( markdown: string ): void, onModeChange?( mode: 'rich-text' | 'source' ): void, onBlur?(): void, onCaretText?( text: string ): void }`.
- Tests first: mounts in rich text with the given note; a toolbar toggle switches to source and back, and the text is identical after toggling; typing in rich mode calls `onChange` with the full note including front-matter; editing in source mode calls `onChange`; `onModeChange` fires on each switch; a new `value` prop (server-normalised note) is applied via `setMarkdown` only when it differs from the editor's current text; MDXEditor's own front-matter form is not visible in rich mode; invalid front-matter in source mode doesn't throw and keeps the text.
- Code: `MDXEditor` + `diffSourcePlugin`, `frontmatterPlugin`, headings, lists, quote, link, `markdownShortcutPlugin`, `toolbarPlugin` with only the toggle; `forwardRef`-free: a ref to `MDXEditorMethods` kept inside the component.

## 6.3 Use `NoteEditor` on the review screen
- Files: `ReviewScreen.tsx` + `ReviewScreen.test.tsx`; `SummaryEditor` is left for 6.4.
- Tests first (NoteEditor mocked): the screen passes `autosave.note` as `value` and `autosave.setNote` as `onChange`; the `PropertiesPanel` is shown in rich mode and hidden in source mode; a mode switch flushes the autosave and then calls `adoptServerNote`; blur does the same; the server's normalised note reaches the editor only after blur or a mode switch (not while typing).
- Code: local `mode` state set from `onModeChange`; `handleModeChange` = flush then adopt.

## 6.4 Caret sync in both modes; remove `SummaryEditor`
- Files: `NoteEditor.tsx` + tests; `ReviewScreen.tsx` + tests; `src/timestamp.ts` (reuse `parseTimestampSeconds`, `lineAt`); delete `components/SummaryEditor/`; `apps/web/CLAUDE.md` (Stack: MDXEditor allowed by ADR 0019; folder list).
- Tests first: rich mode: selecting inside the block that holds a `[12:34](…)` link or `[12:34]` text reports that block's text (read from the DOM selection's closest block element inside the editor), so `ReviewScreen` focuses transcript second 754; a block without a stamp keeps the previous marker; source mode: the CodeMirror active line's text is reported (`.cm-activeLine`), with the same marker rules; the 0.2.0 caret-sync tests still pass against a mocked `NoteEditor` that emits `onCaretText`.
- **Gate 2:** if the selection can't be read in a testable way in jsdom (CodeMirror selection or Lexical selection), I stop and ask.

## Verification
- Per task: `pnpm test`, `pnpm lint`, `pnpm typecheck` in `apps/web`; server and shared are untouched.
- End of checkpoint: run the dev server with the server and a seeded review job, open the review screen in a browser, edit in both modes, toggle, reload, and check the saved note in the vault is byte-for-byte what the source mode showed (needs a browser tool, which I don't have, so I will say so again and list the exact steps for you).
- Report: tasks with commit hashes, results per folder, ADRs (none expected; if a gate fails, a new ADR is proposed rather than written).
