// Packages
import { z } from 'zod'
// Shared
import { HealthError, HealthKind } from '@mnemosyne/shared'
// Repositories
import { getDatabase, inTransaction } from './database.js'

const KEPT_ERRORS = 5

export const HealthRecord = z.object( {
  kind: HealthKind,
  subject_id: z.string(),
  last_checked_at: z.string().nullable(),
  last_success_at: z.string().nullable(),
  last_error: z.string().nullable(),
  failing_since: z.string().nullable(),
  detail: z.string().nullable(),
} )
export type HealthRecord = z.infer< typeof HealthRecord >

export const recordSuccess = (
  kind: HealthKind,
  id: string,
  at: string,
  detail?: string,
): void => {
  getDatabase().prepare( `INSERT INTO health_status (
      kind, subject_id, last_checked_at, last_success_at, last_error, failing_since, detail
    ) VALUES ( @kind, @id, @at, @at, NULL, NULL, @detail )
    ON CONFLICT ( kind, subject_id ) DO UPDATE SET
      last_checked_at = excluded.last_checked_at,
      last_success_at = excluded.last_success_at,
      last_error = NULL,
      failing_since = NULL,
      detail = excluded.detail` ).run( { kind, id, at, detail: detail ?? null } )
}

export const recordFailure = (
  kind: HealthKind,
  id: string,
  at: string,
  message: string,
): void => {
  inTransaction( () => {
    const db = getDatabase()

    db.prepare( `INSERT INTO health_status (
        kind, subject_id, last_checked_at, last_error, failing_since
      ) VALUES ( @kind, @id, @at, @message, @at )
      ON CONFLICT ( kind, subject_id ) DO UPDATE SET
        last_checked_at = excluded.last_checked_at,
        last_error = excluded.last_error,
        failing_since = COALESCE( health_status.failing_since, excluded.failing_since )` )
      .run( { kind, id, at, message } )

    db.prepare( `INSERT INTO health_errors ( kind, subject_id, at, message )
      VALUES ( ?, ?, ?, ? )` ).run( kind, id, at, message )

    db.prepare( `DELETE FROM health_errors WHERE kind = ? AND subject_id = ? AND id NOT IN (
        SELECT id FROM health_errors WHERE kind = ? AND subject_id = ?
        ORDER BY at DESC, id DESC LIMIT ?
      )` ).run( kind, id, kind, id, KEPT_ERRORS )
  } )
}

export const getHealth = ( kind: HealthKind, id: string ): HealthRecord | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM health_status WHERE kind = ? AND subject_id = ?' )
    .get( kind, id )

  return row === undefined ? undefined : HealthRecord.parse( row )
}

export const listHealth = (): HealthRecord[] => {
  return getDatabase().prepare( 'SELECT * FROM health_status' ).all().map( ( row ) => {
    return HealthRecord.parse( row )
  } )
}

export const listErrors = ( kind: HealthKind, id: string ): HealthError[] => {
  return getDatabase()
    .prepare( `SELECT at, message FROM health_errors
      WHERE kind = ? AND subject_id = ? ORDER BY at DESC, id DESC` )
    .all( kind, id )
    .map( ( row ) => HealthError.parse( row ) )
}

export const deleteHealth = ( kind: HealthKind, id: string ): void => {
  inTransaction( () => {
    const db = getDatabase()

    db.prepare( 'DELETE FROM health_status WHERE kind = ? AND subject_id = ?' ).run( kind, id )
    db.prepare( 'DELETE FROM health_errors WHERE kind = ? AND subject_id = ?' ).run( kind, id )
  } )
}
