# 0040. Newsletters: convert the whole cleaned body, not Readability's best block

- Status: Accepted
- Date: 2026-10-20

## Context
ADR 0036 chose Readability first for `emailToMarkdown`, with the whole body (layout tables unwrapped) as the fallback when Readability found fewer than `ARTICLE_LIMITS.minExtractedChars`. The first fixtures from Naresh's real newsletters (five emails: DeepLearning.AI's two, Dense, Trends.vc and Ideabrowser) showed what Readability does to an email with several sections: it keeps the block it scores highest and drops the rest, without saying so. Measured against each email's plain-text part (paragraphs of 60 or more characters that are body copy):

| Email | Readability | Whole cleaned body |
| --- | --- | --- |
| DeepLearning (short) | 5 of 5 | 5 of 5 |
| Dense | found nothing, fell back | 30 of 30 |
| Trends.vc | 35 of 35 | 35 of 35 |
| Ideabrowser | 1 of 1, 16% shorter | 1 of 1 |
| The Batch-style issue | **25 of 33**, a whole section of paper summaries missing | 33 of 33 |

The whole cleaned body kept everything on all five, and its footer sat at the very end (96–100% of the text), where the footer cut works cleanly.

## Decision
- **`emailToMarkdown` converts the whole cleaned body and never runs Readability.** Steps: no HTML → the plain-text part; otherwise drop images, pictures, styles, scripts, the head, elements hidden with `display:none`, `max-height:0` or `mso-hide:all`, and a first element with `opacity:0` (the preheader); convert with `htmlToMarkdown( …, { layoutTables: 'unwrap' } )`; drop a leading "view in browser / read online" line; cut from the last block with an unsubscribe or preferences link when it starts in the final third; collapse blank lines. An HTML part that converts to nothing falls back to the text part.
- Everything else in 0036 stands: the pasted-text path (`articleFromText`, origin `'email'`), the Gmail link as `source`, no page fetch, no new dependency, and the `layoutTables: 'unwrap'` option.

## Consequences
- A newsletter keeps all its sections, including sponsor blocks and links to other items; the summary prompt decides what matters. Navigation-like chrome that survives cleaning costs a few tokens.
- One code path instead of two, and no dependence on Readability's scoring for content that isn't an article.
- Readability stays in use for web articles (ADR 0031); only email stops using it.
- A subscription box in the middle of an email (Dense has one before its last sponsor) stays, because it starts before the final third.

## Alternatives considered
- **Readability only when it loses almost nothing** (at least 95% as long as the whole body): on the five fixtures it was 80–90% every time, so it would never be chosen on real data.
- **Keep 0036 as written:** one of five real newsletters would reach the summary with a quarter of its paragraphs missing.
