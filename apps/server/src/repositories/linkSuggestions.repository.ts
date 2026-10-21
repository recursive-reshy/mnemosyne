// Packages
import { z } from 'zod'
// Shared
import { StoredLinkSuggestion } from '@mnemosyne/shared'
import type { LinkSuggestion, LinkSuggestionStatus } from '@mnemosyne/shared'
// Repositories
import { getDatabase } from './database.js'

const placeholders = ( values: readonly unknown[] ): string => values.map( () => '?' ).join( ', ' )

const parseRows = ( rows: unknown[] ): StoredLinkSuggestion[] => {
  return z.array( StoredLinkSuggestion ).parse( rows )
}

const COLUMNS = 'id, job_id, position, target, kind, anchor, reason, status, decided_at'

// Positions keep rising across the runs of a job, so a re-run's rows sort after the older ones
export const insertSuggestions = (
  runId: number,
  jobId: string,
  suggestions: LinkSuggestion[],
): StoredLinkSuggestion[] => {
  const db = getDatabase()

  return db.transaction( () => {
    const { next } = db
      .prepare( `SELECT COALESCE( MAX( position ), -1 ) + 1 AS next
        FROM link_suggestions WHERE job_id = ?` )
      .get( jobId ) as { next: number }
    const insert = db.prepare( `INSERT INTO link_suggestions (
        id, job_id, run_id, position, target, kind, anchor, reason, status
      ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, 'pending' )` )
    const ids = suggestions.map( ( suggestion, index ) => {
      const id = crypto.randomUUID()

      insert.run(
        id,
        jobId,
        runId,
        next + index,
        suggestion.target,
        suggestion.kind,
        suggestion.anchor,
        suggestion.reason,
      )

      return id
    } )

    return findSuggestions( jobId, ids )
  } )()
}

export const listSuggestions = ( jobId: string ): StoredLinkSuggestion[] => {
  return parseRows( getDatabase()
    .prepare( `SELECT ${ COLUMNS } FROM link_suggestions
      WHERE job_id = ? AND status != 'superseded' ORDER BY position` )
    .all( jobId ) )
}

export const findSuggestions = ( jobId: string, ids: string[] ): StoredLinkSuggestion[] => {
  if( ids.length === 0 ) {
    return []
  }

  return parseRows( getDatabase()
    .prepare( `SELECT ${ COLUMNS } FROM link_suggestions
      WHERE job_id = ? AND id IN ( ${ placeholders( ids ) } ) ORDER BY position` )
    .all( jobId, ...ids ) )
}

export const setStatus = (
  ids: string[],
  status: LinkSuggestionStatus,
  decidedAt: string,
): void => {
  if( ids.length === 0 ) {
    return
  }

  getDatabase()
    .prepare( `UPDATE link_suggestions SET status = ?, decided_at = ?
      WHERE id IN ( ${ placeholders( ids ) } )` )
    .run( status, decidedAt, ...ids )
}

export const supersedePending = ( jobId: string ): void => {
  getDatabase()
    .prepare( `UPDATE link_suggestions SET status = 'superseded'
      WHERE job_id = ? AND status = 'pending'` )
    .run( jobId )
}

export const deleteForJob = ( jobId: string ): void => {
  getDatabase().prepare( 'DELETE FROM link_suggestions WHERE job_id = ?' ).run( jobId )
}
