# Checkpoint H plan: Phase 9, phone access and e2e (tasks 9.1–9.4)

## Context
Checkpoints A–G built Melete end to end. Checkpoint H makes it reachable from the phone (installable web app, localhost-only port, Tailscale guide) and adds the Melete end-to-end test. No new dependency, no contract change, no ADR expected (0060 and 0053 cover it). If something outside the PRD/TRD/ADRs turns up, stop and ask.

Already in place: `apps/web/public/icons/` holds all six files (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png`, `favicon.svg`, `icon.svg`); `routes.tsx` has `melete` (the manifest's `start_url`); `webRoutes` serves `public/` through `express.static`; `OBSIDIAN_VAULT_NAME` is already in `.env.example`; the e2e override already uses `ports: !override` (3101).

ADRs read: 0060 (phone access), 0053 (e2e). TRD §11.5, §12, §13.3 govern.

## 9.1 Manifest, icons, `index.html` meta (ADR 0060)
Files: `apps/web/public/manifest.webmanifest` (new), `apps/web/index.html`, `apps/web/src/manifest.test.ts` (new), `apps/server/src/routes/web.routes.ts` and `.test.ts`.
- **Tests first (web, `manifest.test.ts`, node reads files):** manifest parses; has `name`/`short_name` "Mnemosyne", `display "standalone"`, `scope "/"`, `start_url "/melete"`, `background_color`/`theme_color`; `start_url` matches a path in `routes.tsx` (import `routes` and check the `melete` child exists); icons list is the three TRD entries with the right `purpose`; every icon file exists and its PNG header (bytes 16–23) has the width and height its name says (192, 512, maskable 512; apple-touch 180 checked too). A second test reads `index.html` for the manifest link, apple-touch-icon, svg icon, two `theme-color` metas with `media`, the three apple/mobile-web-app metas, and `viewport-fit=cover`. Red: manifest missing, meta absent.
- **Tests first (server, `web.routes.test.ts`):** write a `manifest.webmanifest` into the temp web dir; `GET /manifest.webmanifest` → 200, `Content-Type` starting `application/manifest+json`. Red expected if `express.static` serves it as `application/octet-stream`/`json`; if it is already right, the test still locks it in. Fix in `setHeaders` (explicit type for that basename) only if red.
- Then: write the manifest (colours read from `theme.ts`: light background and primary), edit `index.html`.
- Gate: `apps/web` test, lint, typecheck, `test:browser` not touched (run anyway for safety only if config changes); `apps/server` test, lint, typecheck.

## 9.2 Compose binds to localhost (ADR 0060)
Files: `docker-compose.yml`.
- Change `mnemosyne.ports` to `"127.0.0.1:3100:3100"`.
- Verify with `docker compose config` (needs `VAULT_HOST_PATH`/`BACKUP_HOST_PATH`/keys set inline): the published host IP is `127.0.0.1`. And with the override: `docker compose -f docker-compose.yml -f e2e/docker-compose.e2e.yml config` shows only `3101:3100` (the `!override` replaces it). This is config verification, not a unit test; recorded in the log line. Update the README/CLAUDE.md lines that say "3100" is published on all interfaces, if any (grep).

## 9.3 `docs/phone-access.md` and README link (ADR 0060)
Files: `docs/phone-access.md` (new), `README.md`.
- Content per TRD §12: Tailscale on Mac and phone, same tailnet; enable HTTPS certificates and MagicDNS in the admin console; `tailscale serve --bg 3100`; the `https://<machine>.<tailnet>.ts.net` address; machine names appear in public Certificate Transparency logs, so rename first; never `tailscale funnel`; keep the Mac awake on power (System Settings → Battery → Options); Gmail is connected from the Mac at `localhost`; Add to Home Screen in Safari and Chrome; `tailscale serve status` / `tailscale serve reset`; troubleshooting (Mac asleep, Tailscale off, container down).
- **Check every command and menu name against Tailscale's current docs** (context7, else web search/fetch) and the macOS menu path, and note "Checked against Tailscale docs on 2026-10-23" in the guide. Anything that differs from TRD §12 is fixed in the guide and mentioned in the checkpoint report.
- Docs only, so no test; a link check (`grep` that the README link target exists) stands in.

## 9.4 e2e: fakes, vault seed, `melete.spec.ts` (ADRs 0053, 0060)
Files: `e2e/fakes/server.mjs`, `fixtures.mjs`, `server.test.mjs`, `e2e/run.sh`, `e2e/playwright.config.ts`, `e2e/tests/melete.spec.ts` (new).
- **Fakes, tests first (`server.test.mjs`, `node --test`):** requests are told apart by the first line of the `system` string (string today; accept a text-block array too): `You summarize…` → summary as now; `You write active-recall questions` → `MELETE_QUESTIONS` (two questions whose `passage` strings are verbatim in the fixture note); `You grade a learner's answer` → `MELETE_GRADE` (`verdict partial`, one `right`, one `missed`, feedback, `suggested_rating hard`). With `tools` present → linker as now. Unknown system line → 400 (tightens today's "no tools means summary"; the existing summary tests send a real first line, so update their request helper and list it in the log). New tests: each of the three lines gets its fixture; the questions passages are substrings of `RECALL_NOTE`; the grade parses against the shape (verdict, ≤6 bullets, rating `hard`); unknown → 400; array-form system works.
- **Fixture note:** `RECALL_NOTE` exported from `fixtures.mjs` (so the test can check the passages); `run.sh` seeds `$VAULT_HOST_PATH/Learning/E2E/Recall.md` from it via `node -e` import (or a small `printf` of the same text with a test comparing them? Prefer the single source: `run.sh` calls `node e2e/fakes/seedVault.mjs "$VAULT_HOST_PATH"`, a tiny new script that writes the file from `fixtures.mjs`). `chmod -R 777` the new folders like the existing vault.
- **Playwright:** add a `melete` project using `devices[ 'Pixel 7' ]` (Chromium) with `testMatch: /melete\.spec\.ts/`; the existing project gets `testIgnore` for it so the Desktop-Chrome specs don't rerun on it.
- **`melete.spec.ts`:** Settings: open Today at `/melete`, **Choose learning root**, pick `Learning`, Save; open subject **E2E**; **Enroll all**; wait for "2 questions"; **Start review**; type an answer; **Check**; see "Missed"; the **Hard** rating is pressed; **Next**; Quick mode via the toggle on the next question; **Show answer**; **Good**; see "All done for now". Then `request.get( '/manifest.webmanifest' )` → 200 and JSON `start_url "/melete"`. (Question order is by position, so the second question is answered in Quick.)
- Order caveat: the Melete spec changes the learning-root setting; it runs after the others (alphabetical, `workers: 1`) and nothing else reads it.
- Red → green: the spec is written first and fails against fakes that still answer questions with the summary fixture (output fails `MeleteQuestionsOutput`, note shows Failed). It only runs for real in `pnpm e2e`, which also builds the stack; the fakes unit tests are the fast red/green loop.
- Gate: `e2e` lint and typecheck, `node --test` for the fakes, then full `pnpm e2e` (Docker must be running).

## Per-task gate and commits
Each task: failing tests → green → refactor → tick Status and add a log line in `tasks.md` → one commit (`feat(9.1): …`, `chore(9.2): …`, `docs(9.3): …`, `test(9.4): …`) → push. Stage files by name. Update `apps/web/CLAUDE.md` (public files/manifest, tests) in 9.1 and `e2e/` notes/`CLAUDE.md` mentions (fakes, Melete spec) in 9.4 if they describe those areas.

## End of checkpoint
Run all gates for web, server, shared (untouched but typechecked), e2e; `pnpm e2e`; screenshot is not needed (no screen changes). Report per root `CLAUDE.md`: tasks with hashes, results per folder, ADRs (none; no TRD change expected), deferred items. Do not start checkpoint I.

## Points for approval
1. Tightening the fake: an unknown system prompt now answers 400 instead of falling back to the summary fixture (TRD §13.3 says "Unknown → 400, as now").
2. Seeding via a small `e2e/fakes/seedVault.mjs` so the fixture note and the passages share one source (a new file, no dependency).
