// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const FeedItemStatus = z.enum( [ 'baseline', 'inbox', 'dismissed', 'queued', 'skipped' ] )
export type FeedItemStatus = z.infer< typeof FeedItemStatus >

export const StoredFeedItem = z.object( {
  id: z.string(),
  feed_id: z.string(),
  item_key: z.string(),
  title: z.string(),
  link: z.string(),
  published_at: z.string().nullable(),
  author: z.string().nullable(),
  content_markdown: z.string().nullable(),
  status: FeedItemStatus,
  job_id: z.string().nullable(),
  added_at: z.string(),
} )
export type StoredFeedItem = z.infer< typeof StoredFeedItem >

export type InboxItem = StoredFeedItem & { feed_name: string }

const placeholders = ( ids: string[] ): string => ids.map( () => '?' ).join( ', ' )

export const insertItemIfNew = ( userId: string, item: StoredFeedItem ): boolean => {
  const { changes } = getDatabase().prepare( `INSERT INTO feed_items (
      id, user_id, feed_id, item_key, title, link, published_at, author, content_markdown,
      status, job_id, added_at
    ) VALUES (
      @id, @user_id, @feed_id, @item_key, @title, @link, @published_at, @author, @content_markdown,
      @status, @job_id, @added_at
    ) ON CONFLICT ( feed_id, item_key ) DO NOTHING` ).run( { ...item, user_id: userId } )

  return changes > 0
}

export const listInbox = ( userId: string ): InboxItem[] => {
  return getDatabase()
    .prepare( `SELECT feed_items.*, feeds.name AS feed_name
      FROM feed_items JOIN feeds ON feeds.id = feed_items.feed_id
      WHERE feed_items.user_id = ? AND feed_items.status = 'inbox'
      ORDER BY feed_items.added_at DESC, feed_items.rowid DESC` )
    .all( userId )
    .map( ( row ) => StoredFeedItem.extend( { feed_name: z.string() } ).parse( row ) )
}

export const findItemsByIds = ( userId: string, ids: string[] ): StoredFeedItem[] => {
  if( ids.length === 0 ) {
    return []
  }

  return getDatabase()
    .prepare( `SELECT * FROM feed_items
      WHERE user_id = ? AND id IN ( ${ placeholders( ids ) } )` )
    .all( userId, ...ids )
    .map( ( row ) => StoredFeedItem.parse( row ) )
}

export const setItemStatus = (
  userId: string,
  ids: string[],
  status: FeedItemStatus,
  jobId: string | null = null,
): void => {
  if( ids.length === 0 ) {
    return
  }

  getDatabase().prepare( `UPDATE feed_items SET status = ?, job_id = ?,
      content_markdown = CASE WHEN ? = 'inbox' THEN content_markdown ELSE NULL END
    WHERE user_id = ? AND id IN ( ${ placeholders( ids ) } )` )
    .run( status, jobId, status, userId, ...ids )
}

export const countInbox = ( userId: string, feedId: string ): number => {
  const { count } = z.object( { count: z.number() } ).parse(
    getDatabase()
      .prepare( `SELECT COUNT(*) AS count FROM feed_items
        WHERE user_id = ? AND feed_id = ? AND status = 'inbox'` )
      .get( userId, feedId ),
  )

  return count
}

export const dismissInboxForFeed = ( userId: string, feedId: string ): void => {
  getDatabase().prepare( `UPDATE feed_items SET status = 'dismissed', content_markdown = NULL
    WHERE user_id = ? AND feed_id = ? AND status = 'inbox'` ).run( userId, feedId )
}
