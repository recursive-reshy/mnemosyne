// Packages
import { z } from 'zod'
// Shared
import { GmailDestination, GmailMatch } from '@mnemosyne/shared'
// Repositories
import { getDatabase, inTransaction } from './database.js'
import { deleteHealth } from './health.repository.js'

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

export type SourceFetch = Pick< StoredGmailSource, 'last_skipped_count' >

// last_checked_at and last_error belong to health_status (ADR 0050); reads get them by a join.
const SELECT_SOURCE = `SELECT gmail_sources.*, h.last_checked_at, h.last_error FROM gmail_sources
  LEFT JOIN health_status h ON h.kind = 'gmail_source' AND h.subject_id = gmail_sources.id`

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
      auto_summarize, sync_from, last_skipped_count, created_at, deleted_at
    ) VALUES (
      @id, @name, @match_kind, @label_ids, @query, @destination, @profile_id, @enabled,
      @auto_summarize, @sync_from, @last_skipped_count, @created_at, @deleted_at
    )` ).run( toRow( source ) )
}

export const findSourceById = ( id: string ): StoredGmailSource | undefined => {
  const row = getDatabase().prepare( `${ SELECT_SOURCE } WHERE gmail_sources.id = ?` ).get( id )

  return row === undefined ? undefined : toStoredSource( row )
}

export const listSources = (): StoredGmailSource[] => {
  return getDatabase()
    .prepare( `${ SELECT_SOURCE } WHERE gmail_sources.deleted_at IS NULL
      ORDER BY lower( gmail_sources.name ), gmail_sources.rowid` )
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
      last_skipped_count = @last_skipped_count, created_at = @created_at,
      deleted_at = @deleted_at
    WHERE id = @id` ).run( toRow( updated ) )

  return updated
}

export const markSourceDeleted = ( id: string, now: string ): void => {
  inTransaction( () => {
    getDatabase().prepare( 'UPDATE gmail_sources SET deleted_at = ? WHERE id = ?' ).run( now, id )
    deleteHealth( 'gmail_source', id )
  } )
}

export const listDueSources = ( now: string, intervalMinutes: number ): StoredGmailSource[] => {
  const cutoff = new Date( new Date( now ).getTime() - intervalMinutes * 60_000 ).toISOString()

  return getDatabase()
    .prepare( `${ SELECT_SOURCE }
      WHERE gmail_sources.enabled = 1 AND gmail_sources.deleted_at IS NULL
        AND ( h.last_checked_at IS NULL OR h.last_checked_at <= ? )
      ORDER BY h.last_checked_at IS NOT NULL, h.last_checked_at, gmail_sources.rowid` )
    .all( cutoff )
    .map( toStoredSource )
}

export const recordSourceFetch = ( id: string, fetch: SourceFetch ): void => {
  getDatabase().prepare( 'UPDATE gmail_sources SET last_skipped_count = ? WHERE id = ?' )
    .run( fetch.last_skipped_count, id )
}

export const listActiveSourcesByMatch = (): StoredGmailSource[] => listSources()
