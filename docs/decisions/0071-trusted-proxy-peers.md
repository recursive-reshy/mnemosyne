# 0071. Forwarded headers are trusted from loopback and private-network peers

- Status: Accepted
- Date: 2026-10-28

## Context
ADR 0061 derives the OAuth redirect URI, and the cookie's `Secure` flag, from the address the browser used, and refuses an address that is not in `APP_ORIGINS`. Task 3.3 believed `X-Forwarded-Proto` and `X-Forwarded-Host` only from a loopback peer, on the assumption that Tailscale Serve connects from `127.0.0.1`. Manual testing of 0.9.0 (task 8.4) showed otherwise: signing in at `https://mnemo.taila9fcb9.ts.net` answered 400 "This address isn't configured in APP_ORIGINS". Under Docker Desktop a request that reaches the container through the published port arrives from the Docker gateway, not from loopback; the observed peer address was `192.168.65.1`. The forwarded headers were ignored, so the origin resolved to `http://mnemo.taila9fcb9.ts.net`, which is not configured.

## Decision
- A peer is a trusted proxy when its address is loopback (`127.0.0.1`, `::1`) or in a private network: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` or `fc00::/7`, including their IPv4-mapped IPv6 forms (`::ffff:192.168.65.1`).
- Forwarded headers (`X-Forwarded-Proto`, `X-Forwarded-Host`) and the "Host alone, so try https" fallback are believed only from a trusted proxy, as before from loopback. From any other peer the socket's scheme and `Host` decide.
- The result is still always one of `APP_ORIGINS`; a forged header can select a configured origin at most, never add one.
- Link-local (`169.254/16`, `fe80::/10`) and carrier-grade NAT (`100.64/10`, which includes Tailscale addresses) are not trusted.

## Consequences
- Amends ADR 0061 and task 3.3's log (what `tailscale serve` forwards is now known: it arrives through the Docker gateway with forwarded headers).
- This is safe only while the app is not reachable from a private network except through the proxy. Compose publishes the port on `127.0.0.1` only (ADR 0060), so another machine on the LAN cannot connect, and a process on the Mac connects from loopback or the gateway. If the port is ever published on a LAN address, or the app is deployed behind a different proxy (v1.0's VM), this list must be revisited; the safer shape then is an explicit `TRUSTED_PROXIES` setting.
- The same rule serves `requestScheme`, so the session cookie is `Secure` over the Tailscale address.

## Alternatives considered
- **Trust forwarded headers from any peer:** a client could pick any origin; limited by `APP_ORIGINS`, but it also controls the cookie's `Secure` flag.
- **Only the observed address `192.168.65.1`:** Docker Desktop's gateway differs between versions, and Linux Docker uses `172.17.0.1`.
- **A `TRUSTED_PROXIES` variable now:** more precise, but one more setting to get wrong for a stack whose port is already loopback-only; recorded as the next step if that changes.
- **Make Tailscale Serve connect through loopback:** not something the app controls under Docker Desktop.
