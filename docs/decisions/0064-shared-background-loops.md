# 0064. One background loop of each kind, round-robin by user

- Status: Accepted
- Date: 2026-10-24

## Context
The worker, intake poller, Melete generator, sweeper and service monitor each run as one loop over one user's data. With two users, work must respect module access and removed users, and one user's long queue shouldn't starve the other.

## Decision
- **Keep one loop of each kind for all users.** Each asks the database for the next item across users; the row carries `user_id`, and everything downstream loads that owner's settings, prompts, Gmail token and vault.
- **Eligibility is one view, `eligible_users`:** active users with the module on (the admin always). Vault work also needs a `vault_dir`.
- **The worker and the generator pick round-robin by user:** the next item belongs to the eligible user whose last item started longest ago (`users.last_job_started_at`, `last_generation_started_at`). Still one job at a time. The poller keeps its least-recently-checked order.
- Queued work of a disabled module or removed user stays queued and resumes when access returns. Expiry runs for everyone.
- These cross-user queries live only in `system.repository.ts` (ADR 0062).

## Consequences
- No per-user timers to start, stop or leak.
- With one user, behaviour is exactly as before.
- Two users' jobs still run one at a time; fairness is by turn, not by time.

## Alternatives considered
- **A loop per user:** lifecycle management for timers on every add, remove and module change.
- **One global FIFO:** a batch of long videos from one user blocks the other for hours.
- **Parallel jobs:** whisper-server on the Mac is the bottleneck; revisit with the transcription API in 1.0.
