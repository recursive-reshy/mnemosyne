# 0061. Google sign-in and server-side sessions

- Status: Proposed
- Date: 2026-10-24

## Context
Through 0.8 Mnemosyne has no login: the trust boundary is `localhost` plus Naresh's tailnet (ADR 0060). v0.9 adds a second user, Naresh's brother, so each request must be tied to a person. The app already has a Google Cloud OAuth client for Gmail (ADR 0035), and both users have Google accounts. v1.0 moves the app to a cloud VM, still behind Tailscale.

## Decision
- **Sign in with Google** using OpenID Connect, code flow with PKCE and `state`, scopes `openid email profile` only. Gmail stays a separate, later consent.
- **Allow-list by email:** only a verified Google email matching a `users` row can sign in. `google_sub` is bound on first sign-in and checked afterwards. With no users at all, only `ADMIN_EMAIL` from `.env` can sign in, and becomes the admin.
- **Server-side sessions:** a random 32-byte token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS); only its SHA-256 hash is stored in `sessions`. 30-day sliding expiry. Sign-out or removing a user deletes the rows.
- Every `/api` router except auth and health is behind `requireUser`. State-changing requests must be `application/json`.
- The OAuth client's redirect URIs are derived per origin from `APP_ORIGINS`, for sign-in and Gmail, so both work at `localhost` and the Tailscale address.
- `google-auth-library` becomes a direct dependency at the version already under `@googleapis/gmail`.

## Consequences
- No passwords to store, hash or reset, and no email sending.
- Sessions are revocable at once.
- Tests never call Google: a fake client and a test helper that inserts session rows.
- Each new user must be added as a test user while the Google consent screen is in testing mode.
- The installed iOS web app may keep cookies apart from Safari; checked by hand at release.

## Alternatives considered
- **Email and password:** more to build and to secure, for two people who both have Google accounts.
- **Signed JWTs in a cookie:** can't be revoked without a denylist, and SQLite is already there.
- **Tailscale identity headers as login:** ties the app to Tailscale and doesn't survive a later move off it.
- **Google IAP:** needs a load balancer that costs more than the VM.
