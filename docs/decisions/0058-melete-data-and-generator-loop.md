# 0058. Melete's data model and generator loop

- Status: Proposed
- Date: 2026-10-22

## Context
Enrolling a note or a whole subject means generating questions for each note, a Claude call per note. The job worker only runs rows in `jobs`, whose statuses, 24-hour expiry and `moveTo` rules (ADR 0048) belong to the ingest lifecycle and don't fit question generation.

## Decision
- **Migration 9** adds `melete_subjects`, `melete_notes`, `melete_questions` (with the FSRS card columns), `melete_reviews` and `melete_runs`, and seeds two hidden prompt profiles with purposes `melete_questions` and `melete_grading`.
- **The queue is a column:** `melete_notes.generation` is `idle`, `queued`, `generating` or `failed`, with the last error. A note is claimed by setting `generating` in one statement.
- **A Melete generator loop** (`worker/meleteGenerator.ts`) runs beside the job worker, built the same way: poll every second, one note at a time, started and stopped with the server, `generating` requeued on restart.
- Generation re-reads the note and checks its hash before calling Claude, so a note edited while queued is handled by the scan rules instead of producing stale questions.
- Failures are a per-note status shown in Melete, not a Status-panel row (ADR 0050 is for sources and services).
- Grading is a direct request, not queued.

## Consequences
- The job lifecycle and its tests are untouched.
- A summary and a question generation can run at the same time (one Claude call each), so a large enrollment never blocks the transcriber.
- Two loops to start and stop; the shutdown order gains one step.

## Alternatives considered
- **A new job kind in `jobs`:** one queue, but it would add statuses and exceptions to ADR 0048's table and expiry rules for something that never goes to review.
- **Generating inline on enroll:** simplest, but enrolling 30 notes would hold a request open for minutes.
