# 0069. A job keeps its video's duration

- Status: Accepted
- Date: 2026-10-27

## Context
ADR 0067 reports transcription in audio minutes, and TRD §8.2 sums "each video job's stored duration (the same field the formatters read)". That field is `meta.duration_seconds` inside the job's `source_document`, and saving a note sets `source_document` to null (ADR 0015: the transcript is deleted once the note is saved). Summing it would count only jobs still in review, so the admin's transcription figure would fall to zero for everything already saved.

## Decision
- `jobs` gets a nullable `duration_seconds INTEGER`, in the baseline schema (ADR 0066: the baseline is edited during 0.9).
- It is written whenever a job is stored with a video source document, from `meta.duration_seconds`, and left alone by an update that has no transcript (`COALESCE` in the update), so saving, expiry of the draft and later edits keep it. Articles leave it null.
- `GET /api/admin/usage` sums it per user: the month by `jobs.created_at` in `APP_TIME_ZONE` and all time.
- It is not part of the `Job` contract and no screen shows it.

## Consequences
- Amends TRD §3.2 (a column on `jobs`) and §8.2 (the duration is read from this column, not from the transcript).
- The figure covers jobs that still exist. Jobs deleted by the sweeper or by a user drop out; there is no separate usage ledger.
- Nothing is stored beyond a number the transcript already held.

## Alternatives considered
- **Sum only jobs still holding a transcript:** under-reports everything saved.
- **Defer transcription seconds to the 1.0 API adapter:** leaves ADR 0067's promise unmet for no saving.
- **A `usage_transcription` ledger table:** survives job deletion, but a second table for one number is more than two users need.
