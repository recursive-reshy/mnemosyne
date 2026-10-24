// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const StoredSession = z.object( {
  token_hash: z.string(),
  user_id: z.string(),
  created_at: z.string(),
  last_seen_at: z.string(),
  expires_at: z.string(),
} )
export type StoredSession = z.infer< typeof StoredSession >

export const insertSession = ( session: StoredSession ): void => {
  getDatabase().prepare( `INSERT INTO sessions (
      token_hash, user_id, created_at, last_seen_at, expires_at
    ) VALUES ( @token_hash, @user_id, @created_at, @last_seen_at, @expires_at )` ).run( session )
}

export const findSession = ( tokenHash: string ): StoredSession | undefined => {
  const row = getDatabase()
    .prepare( `SELECT token_hash, user_id, created_at, last_seen_at, expires_at
      FROM sessions WHERE token_hash = ?` )
    .get( tokenHash )

  return row === undefined ? undefined : StoredSession.parse( row )
}

export const touchSession = (
  tokenHash: string,
  lastSeenAt: string,
  expiresAt: string,
): boolean => {
  return getDatabase()
    .prepare( 'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?' )
    .run( lastSeenAt, expiresAt, tokenHash ).changes > 0
}

export const deleteSession = ( tokenHash: string ): boolean => {
  return getDatabase().prepare( 'DELETE FROM sessions WHERE token_hash = ?' )
    .run( tokenHash ).changes > 0
}

export const deleteSessionsForUser = ( userId: string ): number => {
  return getDatabase().prepare( 'DELETE FROM sessions WHERE user_id = ?' ).run( userId ).changes
}

export const deleteExpiredSessions = ( now: string ): number => {
  return getDatabase().prepare( 'DELETE FROM sessions WHERE expires_at < ?' ).run( now ).changes
}
