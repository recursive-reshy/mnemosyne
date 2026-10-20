# 0036. Newsletters: email to Markdown with Readability first and unwrapped layout tables as fallback

- Status: Accepted (amended by 0040)
- Date: 2026-10-19

## Context
Newsletter emails are HTML built for mail clients: layout tables, hidden preheaders, tracking pixels, "view in browser" headers and unsubscribe footers. 0.5.0's `htmlToMarkdown` removes tables, which would delete most of a newsletter, and Readability is tuned for web pages.

## Decision
- **`emailToMarkdown( { html, text } )`**, pure and fixture-tested, in `sources/`.
- Clean first: drop images, styles, scripts, hidden elements and the preheader.
- **Readability first;** if its Markdown reaches the article threshold (`ARTICLE_LIMITS.minExtractedChars`), use it.
- **Fallback:** convert the whole body with `htmlToMarkdown( html, { layoutTables: 'unwrap' } )`, a new option that turns table cells into blocks instead of removing tables. Articles keep the default.
- **Trim** a leading "view in browser" line, and cut from the last block with an unsubscribe or preferences link when it starts in the final third.
- No HTML part → the plain-text part.
- The result enters the pipeline through the pasted-text path (`articleFromText`, origin `'email'`): the note's `source` is a link to the email in Gmail, `author` the sender, `site` the source's name, `published` the received date.

## Consequences
- Newsletters need no page fetch and no new dependency.
- Heuristics will miss some templates; fixtures from Naresh's real newsletters guard the common ones, and new failures become new fixtures.
- Links in the body stay (they are content); only images and tracking pixels are removed.

## Alternatives considered
- **Follow the "view in browser" link** and run the article adapter: cleaner for Substack, but not every newsletter has one, and it adds a fetch and a second failure mode.
- **Plain-text part only:** easy, but many newsletters' text parts are poor or missing.
- **Send the raw HTML to Claude:** no cleaning code, but far more tokens, and the source pane would show HTML.
