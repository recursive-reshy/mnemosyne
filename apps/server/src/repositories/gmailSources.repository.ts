// Packages
import { z } from 'zod'
// Shared
import { GmailDestination, GmailMatch } from '@mnemosyne/shared'
// Repositories
import { getDatabase } from './database.js'

export const StoredGmailSource = z.object( {
  id: z.string(),
  name: z.string(),
  match: GmailMatch,
  destination: GmailDestination,
  profile_id: z.string().nullable(),
  enabled: z.boolean(),
  auto_summarize: z.boolean(),
  sync_from: z.string(),
  last_checked_at: z.string().nullable(),
  last_error: z.string().nullable(),
  last_skipped_count: z.number().int(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
} )
export type StoredGmailSource = z.infer< typeof StoredGmailSource >

export type SourceCheck = Pick<
  StoredGmailSource,
  'last_checked_at' | 'last_error' | 'last_skipped_count'
>

const SourceRow = z.object( {
  match_kind: z.enum( [ 'labels', 'query' ] ),
  label_ids: z.string().nullable(),
  query: z.string().nullable(),
  enabled: z.number(),
  auto_summarize: z.number(),
} ).loose()

const toStoredSource = ( raw: unknown ): StoredGmailSource => {
  const {
    match_kind: kind,
    label_ids: labelIds,
    query,
    ...row
  } = SourceRow.parse( raw )

  return StoredGmailSource.parse( {
    ...row,
    match: kind === 'labels'
      ? { kind, label_ids: JSON.parse( labelIds ?? '[]' ) as unknown }
      : { kind, query },
    enabled: row.enabled === 1,
    auto_summarize: row.auto_summarize === 1,
  } )
}

const toRow = ( source: StoredGmailSource ): Record< string, string | number | null > => {
  const { match, ...rest } = source

  return {
    ...rest,
    match_kind: match.kind,
    label_ids: match.kind === 'labels' ? JSON.stringify( match.label_ids ) : null,
    query: match.kind === 'query' ? match.query : null,
    enabled: source.enabled ? 1 : 0,
    auto_summarize: source.auto_summarize ? 1 : 0,
  }
}

export const insertSource = ( source: StoredGmailSource ): void => {
  getDatabase().prepare( `INSERT INTO gmail_sources (
      id, name, match_kind, label_ids, query, destination, profile_id, enabled,
      auto_summarize, sync_from, last_checked_at, last_error, last_skipped_count,
      created_at, deleted_at
    ) VALUES (
      @id, @name, @match_kind, @label_ids, @query, @destination, @profile_id, @enabled,
      @auto_summarize, @sync_from, @last_checked_at, @last_error, @last_skipped_count,
      @created_at, @deleted_at
    )` ).run( toRow( source ) )
}

export const findSourceById = ( id: string ): StoredGmailSource | undefined => {
  const row = getDatabase().prepare( 'SELECT * FROM gmail_sources WHERE id = ?' ).get( id )

  return row === undefined ? undefined : toStoredSource( row )
}

export const listSources = (): StoredGmailSource[] => {
  return getDatabase()
    .prepare( `SELECT * FROM gmail_sources WHERE deleted_at IS NULL
      ORDER BY lower( name ), rowid` )
    .all()
    .map( toStoredSource )
}

export const updateSource = (
  id: string,
  changes: Partial< Omit< StoredGmailSource, 'id' > >,
): StoredGmailSource | undefined => {
  const source = findSourceById( id )

  if( source === undefined ) {
    return undefined
  }

  const updated: StoredGmailSource = { ...source, ...changes }

  getDatabase().prepare( `UPDATE gmail_sources SET
      name = @name, match_kind = @match_kind, label_ids = @label_ids, query = @query,
      destination = @destination, profile_id = @profile_id, enabled = @enabled,
      auto_summarize = @auto_summarize, sync_from = @sync_from,
      last_checked_at = @last_checked_at, last_error = @last_error,
      last_skipped_count = @last_skipped_count, created_at = @created_at,
      deleted_at = @deleted_at
    WHERE id = @id` ).run( toRow( updated ) )

  return updated
}

export const markSourceDeleted = ( id: string, now: string ): void => {
  getDatabase().prepare( 'UPDATE gmail_sources SET deleted_at = ? WHERE id = ?' ).run( now, id )
}

export const listDueSources = ( now: string, intervalMinutes: number ): StoredGmailSource[] => {
  const cutoff = new Date( new Date( now ).getTime() - intervalMinutes * 60_000 ).toISOString()

  return getDatabase()
    .prepare( `SELECT * FROM gmail_sources
      WHERE enabled = 1 AND deleted_at IS NULL
        AND ( last_checked_at IS NULL OR last_checked_at <= ? )
      ORDER BY last_checked_at IS NOT NULL, last_checked_at, rowid` )
    .all( cutoff )
    .map( toStoredSource )
}

export const recordSourceCheck = ( id: string, check: SourceCheck ): void => {
  getDatabase().prepare( `UPDATE gmail_sources SET
      last_checked_at = @last_checked_at, last_error = @last_error,
      last_skipped_count = @last_skipped_count
    WHERE id = @id` ).run( { ...check, id } )
}

export const listActiveSourcesByMatch = (): StoredGmailSource[] => listSources()
