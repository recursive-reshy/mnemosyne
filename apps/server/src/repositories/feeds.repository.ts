// Repositories
import { getDatabase, inTransaction } from './database.js'
import { deleteHealth } from './health.repository.js'
import {
  SELECT_FEED,
  StoredFeed,
  toRow,
  toStoredFeed,
} from './feedRows.js'
import type { FeedFetch } from './feedRows.js'

export { StoredFeed }
export type { FeedFetch }

export const insertFeed = ( userId: string, feed: StoredFeed ): void => {
  getDatabase().prepare( `INSERT INTO feeds (
      id, user_id, url, feed_url, name, profile_id, enabled, auto_summarize, etag,
      last_modified, last_skipped_count, created_at, deleted_at
    ) VALUES (
      @id, @user_id, @url, @feed_url, @name, @profile_id, @enabled, @auto_summarize, @etag,
      @last_modified, @last_skipped_count, @created_at, @deleted_at
    )` ).run( { ...toRow( feed ), user_id: userId } )
}

export const findFeedById = ( userId: string, id: string ): StoredFeed | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT_FEED } WHERE feeds.id = ? AND feeds.user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : toStoredFeed( row )
}

export const findActiveFeedByFeedUrl = (
  userId: string,
  feedUrl: string,
): StoredFeed | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT_FEED }
      WHERE feeds.feed_url = ? AND feeds.user_id = ? AND feeds.deleted_at IS NULL` )
    .get( feedUrl, userId )

  return row === undefined ? undefined : toStoredFeed( row )
}

export const listFeeds = ( userId: string ): StoredFeed[] => {
  return getDatabase()
    .prepare( `${ SELECT_FEED } WHERE feeds.user_id = ? AND feeds.deleted_at IS NULL
      ORDER BY lower( feeds.name ), feeds.rowid` )
    .all( userId )
    .map( toStoredFeed )
}

export const updateFeed = (
  userId: string,
  id: string,
  changes: Partial< Omit< StoredFeed, 'id' > >,
): StoredFeed | undefined => {
  const feed = findFeedById( userId, id )

  if( feed === undefined ) {
    return undefined
  }

  const updated: StoredFeed = { ...feed, ...changes }

  getDatabase().prepare( `UPDATE feeds SET
      url = @url, feed_url = @feed_url, name = @name, profile_id = @profile_id,
      enabled = @enabled, auto_summarize = @auto_summarize, etag = @etag,
      last_modified = @last_modified, last_skipped_count = @last_skipped_count,
      created_at = @created_at, deleted_at = @deleted_at
    WHERE id = @id AND user_id = @user_id` ).run( { ...toRow( updated ), user_id: userId } )

  return updated
}

export const markFeedDeleted = ( userId: string, id: string, now: string ): void => {
  inTransaction( () => {
    const { changes } = getDatabase()
      .prepare( 'UPDATE feeds SET deleted_at = ? WHERE id = ? AND user_id = ?' )
      .run( now, id, userId )

    if( changes > 0 ) {
      deleteHealth( 'feed', id )
    }
  } )
}

export const recordFeedFetch = ( userId: string, id: string, fetch: FeedFetch ): void => {
  getDatabase().prepare( `UPDATE feeds SET
      etag = @etag, last_modified = @last_modified, last_skipped_count = @last_skipped_count
    WHERE id = @id AND user_id = @user_id` ).run( { ...fetch, id, user_id: userId } )
}
