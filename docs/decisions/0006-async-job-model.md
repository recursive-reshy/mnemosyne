# 0006. Asynchronous job model

- Status: Accepted; Superseded in part by 0012 (job store) and 0015 (statuses)
- Date: 2026-10-14

## Context
Downloading and transcribing a long video takes minutes. A single synchronous request would hang and likely time out.

## Decision
Transcription runs as a background job:

```
POST /api/jobs                           { url }  → 202 { jobId }
GET  /api/jobs/:id                       → { status, progress, error? }
GET  /api/jobs/:id/download?format=md|srt|txt
```

- Statuses: `queued` → `downloading` → `converting` → `transcribing` → `done` | `failed`.
- Start with an **in-memory job store** processing one job at a time.
- The web app **polls** job status every few seconds.

## Consequences
- The UI can show progress and errors clearly.
- Jobs are lost if the server restarts. Acceptable for a personal tool.
- Processing one job at a time avoids overloading Whisper.
- Every status change goes through the jobs service, so Server-Sent Events can be added later by publishing from that one place, without reworking the worker or the jobs logic.

## Alternatives considered
- **BullMQ + Redis:** persistent and robust, but an extra service for no current benefit. Revisit if jobs need to survive restarts.
- **Server-Sent Events / WebSockets:** smoother progress updates, but polling is simpler and good enough for now.
