# Checkpoint B plan: Phases 4–5 (Gmail connection, server and web)

Next: **Checkpoint B, task 4.1** (Plan cell ⬜). On approval: save this to `docs/v0.6.0/plans/checkpoint-b.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint B`, push, then start 4.1.

Read: PRD §6.1, TRD §1, §4, §9, §10.1–10.2, ADR 0035, ADR 0007. Order is strict. Every task: red (watch it fail for the right reason) → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: `test`, `lint`, `typecheck` for every package touched; web tasks also run `test:browser`. No test touches the network or a real Gmail account.

Existing tests pass unchanged except where listed in a log line.

## Decisions taken while planning
- **`@googleapis/gmail` and `google-auth-library`** (4.3): the TRD §1 names the first and says to use the second through its re-export. I'll check the real API when adding (`OAuth2Client` export, `gmail_v1.Gmail`, `revokeToken`, `generateAuthUrl`). If the re-export doesn't exist, add `google-auth-library` as a direct dependency and say so in the log line (the TRD allows that).
- **Logging:** the server has no logger module (it uses `console`). Tests for "no secrets in logs" spy on `console.error` / `warn` / `log`.
- **`config.gmail`** is `null` unless client ID, secret and key are all set. A key set but invalid fails startup. A key unset with client ID/secret set means `null`.
- **Fixture script location:** the server's tsconfig only includes `src`, so the script goes at `apps/server/scripts/save-gmail-fixture.ts`, run by `tsx` (already a devDependency). Its pure scrubbing function lives in `src/gmail/scrubMessage.ts` so it is in the typecheck and test run; the script is a thin wrapper. No new dependency.
- **Web snackbar:** MUI `Snackbar` is in `@mui/material` (no new dependency).

---

## 4.1 Config (TRD §4.1)
- Tests first (`config.test.ts`, following the existing cases): `config.gmail` is `null` with nothing set, with only client ID, with ID + secret but no key; non-null with all three, `redirectUri` defaulting to `http://localhost:<PORT>/api/gmail/oauth/callback`, overridden by `GOOGLE_REDIRECT_URI`; empty strings count as unset; `TOKEN_ENCRYPTION_KEY` of 31 or 33 bytes, or not base64, fails with "TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)"; `encryptionKey` is a 32-byte `Buffer`; a non-URL redirect URI fails.
- Red: `config.gmail` undefined. Green: four optional variables in `EnvSchema`, a refine on the key, a `gmail` field in the transform.
- Also: `.env.example` (four names, one-line comments, the `openssl` command); `apps/server/CLAUDE.md` Environment bullet.
- Gate: server.

## 4.2 `gmail/tokenCipher.ts` (TRD §4.2)
- Tests first (`tokenCipher.test.ts`): round trip; two encryptions of the same token differ (random IV); format `v1:<iv>:<tag>:<ct>` with a 12-byte IV; wrong key, tampered ciphertext, tampered tag, unknown version (`v2:…`), and wrong part count all throw `TokenDecryptError` (class exported, `name` set).
- Red: module missing. Green: `encryptToken` / `decryptToken` on `node:crypto` AES-256-GCM.
- Gate: server.

## 4.3 `@googleapis/gmail` and `gmail/auth.ts` (TRD §4.3)
- Add `@googleapis/gmail` to the server (pinned to the current version at the time). Check the API against TRD §4.3 first.
- Tests first (`auth.test.ts`), with `google-auth-library` / `@googleapis/gmail` mocked via `vi.mock` and an in-memory DB:
  - `createConsentUrl`: calls `generateAuthUrl` with `access_type: 'offline'`, `prompt: 'consent'`, the single read-only scope, `include_granted_scopes: false`, a 64-hex `state`; states are unique; a state expires after 10 minutes (fake timers); the 21st outstanding state drops the oldest.
  - `completeConsent`: unknown state, expired state, and reused state each throw `OAuthStateError` (state consumed either way); missing `refresh_token` and a granted scope without `gmail.readonly` each throw their own error (the callback maps them to `no_refresh_token` / `scope` in 4.4); success reads the address from `getProfile` and saves the account `connected` with an **encrypted** token (assert the stored value is not the plain token and decrypts to it).
  - `getGmailClient`: no account → `GmailNotConnectedError`; builds a client with the decrypted token; cached until the account row changes; undecryptable token → status `reconnect_needed` and `GmailNotConnectedError`.
  - `withGmail`: passes the client; `invalid_grant` or a 401 → `reconnect_needed` with the TRD message and `GmailAuthError`; other errors pass through unchanged and leave the status alone.
  - `disconnect`: revokes (revoke failure ignored), deletes the account, clears the cache.
  - Logging: on the failure paths (decrypt failure, `invalid_grant`, revoke failure) no `console` call receives the plain refresh token, the code, or an `Authorization` value.
- Red: module missing. Green: `auth.ts` with `SCOPE`, error classes, state `Map`, cache; uses the 3.2 `gmailAccount` repository.
- Gate: server. Log line records the pinned version and whether `google-auth-library` was added directly.

## 4.4 Gmail account routes (TRD §4.4)
- Tests first (`gmail.routes.test.ts`, Supertest, `gmail/auth.js` mocked with `vi.mock`, `config` mocked for configured / unconfigured):
  - `GET /api/gmail/account`: `not_configured` (config null, 200), `not_connected`, `connected` with email and `connected_at`, `reconnect_needed` with the error; the body never contains `refresh_token_enc` or a token (asserted with `JSON.stringify`).
  - `GET /api/gmail/connect`: 302 to the mocked consent URL; 409 "Gmail isn't configured" when config is null.
  - `GET /api/gmail/oauth/callback`: always 302; success → `/settings?gmail=connected`; `error=access_denied` → `reason=denied`; bad state → `state`; no refresh token → `no_refresh_token`; wrong scope → `scope`; any other error → `failed`; missing `code` → `failed`. No token in the redirect URL.
  - `POST /api/gmail/disconnect`: 204 and `disconnect` called; 409 when unconfigured.
  - `GET /api/gmail/labels`: 200 with `ListGmailLabelsResponse` parsed, order user labels first then `INBOX` (system labels other than `INBOX` dropped), by name; 409 not connected / not configured; reconnect-needed (`GmailAuthError`) → 409.
- Labels need `listLabels()` which TRD §5.1 puts in `gmail.client.ts` (task 6.1). To keep 4.4 self-contained, `gmail.service.ts` calls `withGmail( client => client.users.labels.list(…) )` directly through the mocked boundary; 6.1 later moves it into `gmail.client.ts` (noted so the 6.1 plan covers it).
- Green: `routes/gmail.routes.ts`, `controllers/gmail.controller.ts`, `services/gmail.service.ts` (account view, connect, callback mapping, disconnect, labels), `ConflictError` for 409; mounted in `app.ts`. Layers per `apps/server/CLAUDE.md`.
- Update `apps/server/CLAUDE.md` folder structure (`gmail/`, new routes/controllers/services).
- Gate: server.

## 4.5 Fixture script (TRD §9.2)
- Tests first (`gmail/scrubMessage.test.ts`) on a hand-made `gmail_v1.Schema$Message` (base64url bodies, nested parts): Naresh's address and display name replaced with `naresh@example.com` / `Naresh` in headers (`To`, `From`, `Delivered-To`, `Cc`, `Reply-To`), in plain and HTML bodies after decoding, and in snippet; re-encoded to base64url; case-insensitive; other senders untouched; the original object is not mutated.
- Green: `scrubMessage( message, { email, name } )` in `src/gmail/scrubMessage.ts`; `scripts/save-gmail-fixture.ts` (uses `getGmailClient`, `users.messages.get format: 'full'`, writes `src/test-support/gmail/<name>.json`, refuses a name with path characters); `fixture:gmail` script in `package.json` (`tsx --env-file-if-exists=.env scripts/save-gmail-fixture.ts`). The script itself is not unit-tested (it needs a real account); the scrubbing is.
- Add `scripts` to the server `tsconfig.json` `include` so it is typechecked and linted; keep `tsconfig.build.json` as is.
- Gate: server.

## 5.1 Web data layer (TRD §10.1)
- Tests first:
  - `api/gmail.api.test.ts` (fetch stubbed, as `feeds.api.test.ts`): `getGmailAccount` parses `GetGmailAccountResponse`; `listGmailLabels`; `disconnectGmail` POSTs and accepts 204; a bad body or non-2xx throws a readable error; `connectUrl` is the exported `/api/gmail/connect` string.
  - `hooks/queryKeys.test.ts`: `gmailKeys.account`, `gmailKeys.labels`.
  - `useGmailAccount.test.ts`: returns account, `isLoading`, `error`, a `disconnect` mutation that invalidates the account; `refetchInterval` option is not set here (the 5-minute poll arrives with 10.3).
  - `useGmailLabels.test.ts`: query is `enabled` only when asked (the hook takes `enabled`), returns `labels`.
- Green: `api/gmail.api.ts`, `gmailKeys` in `queryKeys.ts`, `hooks/useGmailAccount.ts`, `hooks/useGmailLabels.ts`, following `useFeeds` / `feeds.api` patterns.
- Gate: web (`test`, `test:browser`, `lint`, `typecheck`).

## 5.2 `GmailSettings` account card (TRD §10.2)
- Tests first (`GmailSettings.test.tsx`, RTL, hooks mocked as the other settings tests do):
  - `not_configured`: setup text and a link to the README Google section; no Connect button.
  - `not_connected`: **Connect Gmail** is an `<a href="/api/gmail/connect">`.
  - `connected`: "Connected as naresh@example.com" and **Disconnect**; clicking opens the `ConfirmDialog`; confirming calls `disconnect`; cancelling doesn't.
  - `reconnect_needed`: the reason text and a **Reconnect** link to `/api/gmail/connect`.
  - Loading (`role="status"`) and error (`role="alert"`) states.
  - Snackbar: `?gmail=connected` shows "Gmail connected"; `?gmail=error&reason=denied|state|no_refresh_token|scope|failed` shows one distinct plain message each; unknown reason → a generic message; the query is removed with `replace` after showing (assert the router location, via `MemoryRouter`).
  - `SettingsPage.test.tsx`: renders `GmailSettings` (placed after `FeedSettings`).
- Green: `components/GmailSettings/{index.ts, GmailSettings.tsx, GmailSettings.test.tsx}`; reads the query with `useSearchParams` (a component under the settings route may do so; I'll keep the router access in a tiny `useGmailRedirectNotice` hook so the component stays free of URL handling per `apps/web/CLAUDE.md` "Layers"); placed in `SettingsPage`.
- Update `apps/web/CLAUDE.md` (folder structure line: `GmailSettings`, `useGmailAccount`, `useGmailLabels`).
- Browser check: screenshots of Settings → Gmail in light and dark for the four states (served against a stubbed account) for the checkpoint report.
- Gate: web.

## Checkpoint report (end)
Per CLAUDE.md "Before you stop": tasks with commit hashes, test/lint/typecheck per folder (web also `test:browser`), screenshots, ADRs (none expected), deferrals.
