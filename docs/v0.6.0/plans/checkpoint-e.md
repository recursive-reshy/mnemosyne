# Checkpoint E plan: Phase 9 (defer job alerts)

Next: **Checkpoint E, task 9.1** (Plan cell ⬜). On approval: save this to `docs/v0.6.0/plans/checkpoint-e.md`, tick the Plan cell in `tasks.md`, commit `docs(plan): checkpoint E`, push, then start 9.1.

Read: PRD §6.4–6.5 (deferred), TRD §5.7, §10.4 (last bullet), §11, ADR 0041, ADR 0037, ADR 0035, ADR 0007. Order is strict. Every task: red → green → refactor → tick Status + log line → commit `feat(<id>): …` → push. Gate after each task: `test`, `lint`, `typecheck` (and `build` for server) for every package touched; web tasks also run `test:browser`. No test touches the network or a real Gmail account.

## Decisions taken while planning
- **The 400 check runs first in `createSource`, before `requireConnectedGmail()`.** A jobs request is invalid whatever the connection state. The error is `ValidationError( "Freelance jobs sources aren't available yet" )`. The route maps it to 400 already.
- **Only `createSource` changes on the server.** `updateSource`'s jobs branch, `collectStarting`'s jobs branch (preview and create), `auto_summarize`'s newsletter guard and the jobs paths in the poller stay. They read stored data and are the later version's starting point (ADR 0041: "nothing already built is removed"). `previewSource` is not refused, since the web never sends jobs and TRD §5.7 only names create.
- **Existing tests that create a jobs source through `createSource` or `POST /api/gmail/sources` must change** (TRD §9.1 doesn't list this, so each is named in the log line). They exist to prove other behaviour, so they switch to `newsletter`; tests that only seed stored jobs rows (`addStoredSource( { destination: 'jobs' } )`, repository tests) stay untouched:
  - `routes/gmailSources.routes.test.ts`: "creates a source and answers 201" (jobs → newsletter, name/label adjusted); the 409 tests at the end (jobs → newsletter); the `it.each` 400 cases for "no name" / "a blank name" (jobs → newsletter) are kept as 400s either way. The two "…on a jobs source" cases stay and still get 400 (now from the refusal; the body is still invalid either way).
  - `services/gmailSources.service.test.ts` lines using `destination: 'jobs'` in `createSource` calls (about lines 94, 194, 578, 595): I check each; ones that go through `createSource` switch to newsletter, ones that build a stored source don't change.
- **`GmailDestinationField` is deleted** (`git rm`, with its test if it has one) rather than left unused. `intakeLine` keeps its `'jobs'` branch (the type still has both values; its tests stay). `toCreateBody` keeps its signature, so its tests stay.
- **Drawer dot (9.4):** MUI `Badge variant="dot" color="warning"` around the Settings icon. It reads `useGmailAccount`, which gains a 5-minute `refetchInterval` (TRD §10.4). In the mini drawer the dot is on the icon, and the Settings item's accessible name gets ", Gmail needs reconnecting" in the tooltip/`aria-label` so it is not colour-only. Only `reconnect_needed` shows it (not `not_connected`/`not_configured`).

---

## 9.1 Accept ADR 0041; mark ADR 0037 as deferred (docs only)
- No test (docs). Edit: `docs/decisions/0041-defer-job-alert-intake.md` Status → Accepted; `docs/README.md` index row 0041 → Accepted; in `0037-job-postings-dataset.md` add a line under the Status: "Deferred by ADR 0041 (design stands for a later version)". The README row for 0037 already says "Accepted (deferred by 0041)".
- Gate: none needed beyond a diff check. Commit `docs(9.1): accept ADR 0041`, tick 9.1.

## 9.2 Server refuses `destination: 'jobs'` on create (TRD §5.7)
- Tests first:
  - `routes/gmailSources.routes.test.ts`: new case "refuses a jobs source with 400 and the message 'Freelance jobs sources aren't available yet'", asserting nothing is stored and `listMatchingIds` is not called.
  - `services/gmailSources.service.test.ts`: `createSource` with `destination: 'jobs'` rejects with `ValidationError`, even when Gmail is disconnected, and stores nothing.
  - Update the existing tests listed above to newsletter (they'd otherwise go red for the wrong reason).
- Red: the new tests fail because a jobs source is created (201). Green: a guard at the top of `createSource` in `services/gmailSources.service.ts`.
- Gate: server `test`, `lint`, `typecheck`, `build`.

## 9.3 Web: no destination choice in `AddGmailSourceDialog` (TRD §5.7)
- Tests first (`AddGmailSourceDialog.test.tsx`): no **Newsletter / Freelance jobs** radios; the newsletter fields (profile, Summarize automatically, backfill) are always shown; the submitted body always has `destination: 'newsletter'`; the preview line is the newsletter line. The test at about line 282 that picks the jobs destination is removed/rewritten, listed in the log.
- Red: radios still present. Green: drop the `destination` state, `handleDestination`, the `GmailDestinationField` import and the `destination === 'newsletter'` condition; `const destination = 'newsletter'` as a module constant used in `key`, `intakeLine` and `toCreateBody`. Delete `GmailDestinationField.tsx`.
- `GmailSourceList` keeps its destination chip; `EditGmailSourceDialog` keeps the read-only destination.
- Gate: web `test`, `lint`, `typecheck`, `test:browser`.

## 9.4 Drawer warning dot on Settings (TRD §10.4)
- Tests first:
  - `NavDrawer.test.tsx` (the render helper provides a query client; the account fetch is mocked at `api/gmail.api`): a dot and a "Gmail needs reconnecting" label on Settings when the account is `reconnect_needed`; none for `connected`, `not_connected`, `not_configured`, while loading, or when the request fails; shown in mini mode and in the narrow drawer too. Existing NavDrawer tests keep passing (their tests may need the `gmail.api` mock; I'll add it in a shared setup and list that in the log).
  - `useGmailAccount.test.ts`: the query refetches every 5 minutes (fake timers, or asserting the option value if the existing tests do that).
- Red: no badge. Green: `useGmailAccount` gets `refetchInterval: 5 * 60 * 1000`; `NavDrawer` reads `account?.status` and wraps the Settings icon in `Badge`. `NavItem` takes an optional `badge` prop (`label` stays the visible text).
- Gate: web `test`, `lint`, `typecheck`, `test:browser`; browser screenshots (light and dark) of the drawer with the dot, for the checkpoint report.

## End of checkpoint
Stop and report: tasks with commit hashes; test/lint/typecheck(/build/test:browser) per package; screenshots (light and dark) of the Add Gmail source dialog and the drawer dot; ADR 0041 accepted (no TRD change; it is already reflected in the TRD's scope note); the existing tests changed and why. Do not start checkpoint F.
