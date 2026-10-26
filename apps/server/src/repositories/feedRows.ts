// Packages
import { z } from 'zod'

// Row mapping shared by the feeds repository and the system repository; not a repository itself

export const StoredFeed = z.object( {
  id: z.string(),
  url: z.string(),
  feed_url: z.string(),
  name: z.string(),
  profile_id: z.string().nullable(),
  enabled: z.boolean(),
  auto_summarize: z.boolean(),
  etag: z.string().nullable(),
  last_modified: z.string().nullable(),
  last_checked_at: z.string().nullable(),
  last_error: z.string().nullable(),
  last_skipped_count: z.number().int(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
} )
export type StoredFeed = z.infer< typeof StoredFeed >

export type FeedFetch = Pick< StoredFeed, 'etag' | 'last_modified' | 'last_skipped_count' >

// last_checked_at and last_error belong to health_status (ADR 0050); reads get them by a join.
export const SELECT_FEED = `SELECT feeds.*, h.last_checked_at, h.last_error FROM feeds
  LEFT JOIN health_status h ON h.kind = 'feed' AND h.subject_id = feeds.id`

export const toStoredFeed = ( raw: unknown ): StoredFeed => {
  const row = z.object( {
    enabled: z.number(),
    auto_summarize: z.number(),
  } ).loose().parse( raw )

  return StoredFeed.parse( {
    ...row,
    enabled: row.enabled === 1,
    auto_summarize: row.auto_summarize === 1,
  } )
}

export const toRow = ( feed: StoredFeed ): Record< string, string | number | null > => {
  return {
    ...feed,
    enabled: feed.enabled ? 1 : 0,
    auto_summarize: feed.auto_summarize ? 1 : 0,
  }
}

// A feed with its owner, for the poller that serves every user
export type OwnedFeed = StoredFeed & { user_id: string }

export const toOwnedFeed = ( raw: unknown ): OwnedFeed => {
  const { user_id } = z.object( { user_id: z.string() } ).loose().parse( raw )

  return { ...toStoredFeed( raw ), user_id }
}
