# 0031. Article extraction: Readability on linkedom, turndown to Markdown, fetch limits

- Status: Proposed
- Date: 2026-10-18

## Context
To summarize an article, the server has to fetch a web page, find the article in it (without navigation, ads and footers), and give Claude clean text. The text should keep headings and lists, because they help the summary and the review pane. Mnemosyne runs in one Node container with no browser.

## Decision
- **Fetch with Node's built-in `fetch`** through a small `http.client`: http(s) only, at most 5 redirects followed by hand, a 15-second timeout, a 5 MB body cap, HTML content types only, a plain `Mnemosyne/<version>` user agent. No login, cookies or paywall workarounds. A page that can't be read is handled by pasting its text.
- **`@mozilla/readability`** (the code behind Firefox Reader View) extracts the article, on a **`linkedom`** document. A `<base href>` is injected so relative links resolve.
- **`turndown`** converts the extracted HTML to Markdown, with rules that drop images, figures, tables, iframes, media, forms and scripts (PRD non-goals) and keep headings, lists, links, emphasis, quotes and code.
- **Limits** shared with the web form (`ARTICLE_LIMITS`): at least 500 extracted characters (else "Not an article page"), at least 200 pasted characters, at most 300,000 characters either way (else a "too long" failure, never a silent cut).
- No blocking of private network addresses: the app is single-user and local, and Naresh chooses every URL.

## Consequences
- Most blogs, Medium, Substack and Ghost pages extract well; heavily scripted pages that render client-side won't, and need pasting.
- linkedom is a lighter, less complete DOM than jsdom. If Readability fails on it for real pages, switch to jsdom with a new ADR; the extractor is isolated behind `extractArticle( html, baseUrl )`, so that is a one-file change.
- Three new server dependencies.

## Alternatives considered
- **jsdom:** the DOM Readability is tested against, but much heavier as a runtime dependency. Kept as the fallback.
- **A headless browser (Playwright) for fetching:** handles script-rendered pages and some logins, but adds a browser to the Docker image and makes fetches slow. Pasting covers the gap.
- **Plain text instead of Markdown** (Readability's `textContent`): no extra dependency, but loses headings and lists.
