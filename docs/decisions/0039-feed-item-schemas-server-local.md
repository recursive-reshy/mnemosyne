# 0039. Feed-item schemas stay server-local until the unified inbox routes land

- Status: Superseded by the implementation of 0038 (task 8.4 removed the schemas and the routes; task 8.5 removes the web shim)
- Date: 2026-10-19

## Context
TRD §2.2 removes the `FeedItem` contracts from `packages/shared` when `inbox.ts` is added (task 2.2), on the grounds that the web is their only consumer. The server uses them too: `feeds.controller.ts` parses the `/api/feed-items` bodies and `feedInbox.service.ts` returns the list. Those routes stay until task 8.4 replaces them with `/api/inbox` (ADR 0038). Removing the schemas from shared in 2.2 would break the server, and keeping them would leave two inbox contracts in shared.

## Decision
- Task 2.2 adds `inbox.ts` to shared and removes `FeedItem`, `ListFeedItemsResponse`, `SummarizeFeedItemsBody`, `SummarizeFeedItemsResponse` and `DismissFeedItemsBody` from `feeds.ts`.
- The server keeps the same schemas, unchanged, in `services/feedItems.schemas.ts` (a service-level file, so the controller and the route test import it without a controller-to-controller dependency). Task 8.4 deletes the file with the feed-item routes.
- The web stops importing the old shapes. `feedItems.api.ts` still calls `/api/feed-items`, adds `kind: 'feed'` to what comes back and sends the ids from `InboxItemRef`s, so the inbox hooks and components already use the new types. Behaviour is unchanged until 8.5.

## Consequences
- Shared holds no contract that is only temporary.
- The web carries a small adapter in `feedItems.api.ts` for a few tasks; 8.5 removes it with the old routes.
- The TRD's statement that the web is the only consumer of the `FeedItem` contracts is wrong; Naresh can correct §2.2.

## Alternatives considered
- Keep the schemas in shared until 8.4: smaller change, but leaves dead contracts in the shared package and the web still importing them.
- Move the routes to `/api/inbox` early: pulls task 8.4 into checkpoint A.
