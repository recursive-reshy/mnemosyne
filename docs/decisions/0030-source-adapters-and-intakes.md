# 0030. Source adapters and intakes: one `SourceDocument` for every source

- Status: Accepted
- Date: 2026-10-18

## Context
Up to 0.4.0 a job is always a video: `runJob` downloads, converts and transcribes, and every later step (summary, review, locked note properties, downloads, saving) reads a `Transcript`. v0.5.0 adds articles from a URL, pasted text and RSS feeds, and a later version will add Gmail (email newsletters and freelance-job alerts). Without a common shape, each new source would add branches through the job, summary and review code.

## Decision
- **Two layers.** *Intakes* find things to summarize and turn them into inbox items or jobs: RSS feeds now, Gmail later. *Adapters* turn a job into a source document: `video` (yt-dlp → ffmpeg → whisper-server), `article` (fetch → extract → Markdown, ADR 0031) and pasted text (built directly at queue time, also used for full-text feed items and, later, email bodies).
- **One shared `SourceDocument`**, a Zod discriminated union in `packages/shared`: `{ kind: 'video', meta, segments }` (today's transcript) or `{ kind: 'article', meta: { title, source, author, site, published, fetched_at, origin }, markdown }`. It is stored in the job's `source_document` column (renamed from `transcript`; migration 5 tags existing rows as `video`).
- **Everything after acquisition depends only on the document's kind**: the summarizer picks locked instructions and output schema by kind, `lockedPropertiesFor( document )` gives the note's locked front-matter, and downloads offer what the kind supports. Nothing downstream knows which intake a job came from, except the `feed_id` shown in the UI.
- **Detection lives in `packages/shared`** (`detectSourceType`), so the web switch and the server agree; the request can override it.
- A job's `source_type` (`video` | `article`) picks its adapter. Articles add one job status, `fetching`.

## Consequences
- A Gmail intake can reuse the pasted-text path with no change to jobs, summaries or review.
- The rename of `transcript` touches many files once, in a behaviour-neutral refactor (checkpoint A).
- The stored transcript is still the source of truth for videos (root `CLAUDE.md`); for articles, the stored Markdown is.
- Amends ADR 0014 (the summarizer takes a source document, not only a transcript) and ADR 0015 (the lifecycle applies to the source document: deleted on save).

## Alternatives considered
- **Articles as a fake transcript** (paragraphs as segments with zero timestamps): no schema change, but every timestamp-based rule (quote ranges, stamps, SRT) would need special cases, and the note would show `(0:00)` everywhere.
- **A separate pipeline per source:** quick for one source, but the review, summary and save code would be copied for each.
