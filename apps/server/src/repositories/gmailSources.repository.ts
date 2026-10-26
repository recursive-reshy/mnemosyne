// Repositories
import { getDatabase, inTransaction } from './database.js'
import { deleteHealth } from './health.repository.js'
import {
  SELECT_SOURCE,
  StoredGmailSource,
  toRow,
  toStoredSource,
} from './gmailSourceRows.js'
import type { SourceFetch } from './gmailSourceRows.js'

export { StoredGmailSource }
export type { SourceFetch }

export const insertSource = ( userId: string, source: StoredGmailSource ): void => {
  getDatabase().prepare( `INSERT INTO gmail_sources (
      id, user_id, name, match_kind, label_ids, query, destination, profile_id, enabled,
      auto_summarize, sync_from, last_skipped_count, created_at, deleted_at
    ) VALUES (
      @id, @user_id, @name, @match_kind, @label_ids, @query, @destination, @profile_id, @enabled,
      @auto_summarize, @sync_from, @last_skipped_count, @created_at, @deleted_at
    )` ).run( { ...toRow( source ), user_id: userId } )
}

export const findSourceById = (
  userId: string,
  id: string,
): StoredGmailSource | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT_SOURCE } WHERE gmail_sources.id = ? AND gmail_sources.user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : toStoredSource( row )
}

export const listSources = ( userId: string ): StoredGmailSource[] => {
  return getDatabase()
    .prepare( `${ SELECT_SOURCE }
      WHERE gmail_sources.user_id = ? AND gmail_sources.deleted_at IS NULL
      ORDER BY lower( gmail_sources.name ), gmail_sources.rowid` )
    .all( userId )
    .map( toStoredSource )
}

export const updateSource = (
  userId: string,
  id: string,
  changes: Partial< Omit< StoredGmailSource, 'id' > >,
): StoredGmailSource | undefined => {
  const source = findSourceById( userId, id )

  if( source === undefined ) {
    return undefined
  }

  const updated: StoredGmailSource = { ...source, ...changes }

  getDatabase().prepare( `UPDATE gmail_sources SET
      name = @name, match_kind = @match_kind, label_ids = @label_ids, query = @query,
      destination = @destination, profile_id = @profile_id, enabled = @enabled,
      auto_summarize = @auto_summarize, sync_from = @sync_from,
      last_skipped_count = @last_skipped_count, created_at = @created_at,
      deleted_at = @deleted_at
    WHERE id = @id AND user_id = @user_id` )
    .run( { ...toRow( updated ), user_id: userId } )

  return updated
}

export const markSourceDeleted = ( userId: string, id: string, now: string ): void => {
  inTransaction( () => {
    const { changes } = getDatabase()
      .prepare( 'UPDATE gmail_sources SET deleted_at = ? WHERE id = ? AND user_id = ?' )
      .run( now, id, userId )

    if( changes > 0 ) {
      deleteHealth( 'gmail_source', id )
    }
  } )
}

export const recordSourceFetch = (
  userId: string,
  id: string,
  fetch: SourceFetch,
): void => {
  getDatabase()
    .prepare( 'UPDATE gmail_sources SET last_skipped_count = ? WHERE id = ? AND user_id = ?' )
    .run( fetch.last_skipped_count, id, userId )
}

export const listActiveSourcesByMatch = ( userId: string ): StoredGmailSource[] => {
  return listSources( userId )
}
