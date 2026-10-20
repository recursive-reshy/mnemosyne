# 0037. Job postings: Claude extraction into fixed columns plus JSON, deduplicated by platform job ID

- Status: Accepted (deferred by ADR 0041; the design stands for a later version)
- Date: 2026-10-19

## Context
The freelance-jobs module (later) needs a history of postings from job-alert emails (Upwork, Freelancer.com and others). One alert email holds several postings, platforms format them differently and change their templates, and the fields vary by platform. Links in alerts are often click-tracking redirects. "Job" already means a processing job in the code.

## Decision
- **Postings, not jobs, in code:** tables `job_postings`, `posting_sightings`, `extraction_runs`; API `/api/postings`; route `/freelance`; drawer label **Freelance jobs**.
- **Claude extraction**, one call per alert email, with structured output (`zodOutputFormat`), a fixed prompt in code, Haiku by default (`extraction_model` setting). Strict schemas can't hold free-form maps, so extra facts come back as key/value pairs.
- **Hybrid storage in SQLite:** fixed columns for what is always present and queried (`platform`, `platform_job_id`, `dedupe_key`, `title`, `url`, `posted_at`, first and last seen) and a `details` JSON column for everything else. The alert email's body is kept in `gmail_messages` so extraction can be re-run.
- **Dedupe key:** `platform:platform_job_id` when Claude finds the platform's id (Upwork's `~01…`), else `platform:normalized URL` (no query, fragment or trailing slash). Redirects are not followed. A repeat sighting updates the posting and adds a `posting_sightings` row.
- **Outcomes per email:** `extracted`, `no_jobs` or `failed`, retried up to 3 times by the poller, then a manual **Retry**. **Re-extract** per email upserts by key.
- **Extraction runs in the intake poller,** at most 20 emails per source per check, never in the job worker. Tokens and cost are recorded per run with the existing pricing table.

## Consequences
- New platforms and fields need no code or migration; analysis later can use `json_extract` and `json_each`.
- A cheap call per email; cost is visible.
- Postings that disappear on re-extraction stay in place; accepted for an append-mostly dataset.
- If a platform hides job ids behind redirects, the same job may appear twice under different URLs; fixtures will show whether that happens.

## Alternatives considered
- **Per-platform parsers:** free and deterministic, but break on template changes and need code per platform.
- **A document database (MongoDB):** flexible, but another container, and the later analysis is aggregation that SQL does well. SQLite's JSON functions give the flexibility.
- **Fully normalized tables** (skills, clients): rigid; every new field is a migration.
- **Deduping by raw URL:** tracking parameters make the same job look new in every alert.
