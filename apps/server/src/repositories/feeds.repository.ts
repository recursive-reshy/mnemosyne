// Packages
import { z } from 'zod'
// Repositories
import { getDatabase, inTransaction } from './database.js'
import { deleteHealth } from './health.repository.js'

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
const SELECT_FEED = `SELECT feeds.*, h.last_checked_at, h.last_error FROM feeds
  LEFT JOIN health_status h ON h.kind = 'feed' AND h.subject_id = feeds.id`

const toStoredFeed = ( raw: unknown ): StoredFeed => {
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

const toRow = ( feed: StoredFeed ): Record< string, string | number | null > => {
  return {
    ...feed,
    enabled: feed.enabled ? 1 : 0,
    auto_summarize: feed.auto_summarize ? 1 : 0,
  }
}

export const insertFeed = ( feed: StoredFeed ): void => {
  getDatabase().prepare( `INSERT INTO feeds (
      id, url, feed_url, name, profile_id, enabled, auto_summarize, etag, last_modified,
      last_skipped_count, created_at, deleted_at
    ) VALUES (
      @id, @url, @feed_url, @name, @profile_id, @enabled, @auto_summarize, @etag, @last_modified,
      @last_skipped_count, @created_at, @deleted_at
    )` ).run( toRow( feed ) )
}

export const findFeedById = ( id: string ): StoredFeed | undefined => {
  const row = getDatabase().prepare( `${ SELECT_FEED } WHERE feeds.id = ?` ).get( id )

  return row === undefined ? undefined : toStoredFeed( row )
}

export const findActiveFeedByFeedUrl = ( feedUrl: string ): StoredFeed | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT_FEED } WHERE feeds.feed_url = ? AND feeds.deleted_at IS NULL` )
    .get( feedUrl )

  return row === undefined ? undefined : toStoredFeed( row )
}

export const listFeeds = (): StoredFeed[] => {
  return getDatabase()
    .prepare( `${ SELECT_FEED } WHERE feeds.deleted_at IS NULL
      ORDER BY lower( feeds.name ), feeds.rowid` )
    .all()
    .map( toStoredFeed )
}

export const updateFeed = (
  id: string,
  changes: Partial< Omit< StoredFeed, 'id' > >,
): StoredFeed | undefined => {
  const feed = findFeedById( id )

  if( feed === undefined ) {
    return undefined
  }

  const updated: StoredFeed = { ...feed, ...changes }

  getDatabase().prepare( `UPDATE feeds SET
      url = @url, feed_url = @feed_url, name = @name, profile_id = @profile_id,
      enabled = @enabled, auto_summarize = @auto_summarize, etag = @etag,
      last_modified = @last_modified, last_skipped_count = @last_skipped_count,
      created_at = @created_at, deleted_at = @deleted_at
    WHERE id = @id` ).run( toRow( updated ) )

  return updated
}

export const markFeedDeleted = ( id: string, now: string ): void => {
  inTransaction( () => {
    getDatabase().prepare( 'UPDATE feeds SET deleted_at = ? WHERE id = ?' ).run( now, id )
    deleteHealth( 'feed', id )
  } )
}

export const listDueFeeds = ( now: string, intervalMinutes: number ): StoredFeed[] => {
  const cutoff = new Date( new Date( now ).getTime() - intervalMinutes * 60_000 ).toISOString()

  return getDatabase()
    .prepare( `${ SELECT_FEED }
      WHERE feeds.enabled = 1 AND feeds.deleted_at IS NULL
        AND ( h.last_checked_at IS NULL OR h.last_checked_at <= ? )
      ORDER BY h.last_checked_at IS NOT NULL, h.last_checked_at, feeds.rowid` )
    .all( cutoff )
    .map( toStoredFeed )
}

export const recordFeedFetch = ( id: string, fetch: FeedFetch ): void => {
  getDatabase().prepare( `UPDATE feeds SET
      etag = @etag, last_modified = @last_modified, last_skipped_count = @last_skipped_count
    WHERE id = @id` ).run( { ...fetch, id } )
}
