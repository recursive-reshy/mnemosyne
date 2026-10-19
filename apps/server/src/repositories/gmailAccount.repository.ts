// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const StoredGmailAccount = z.object( {
  email: z.string(),
  refresh_token_enc: z.string(),
  scope: z.string(),
  status: z.enum( [ 'connected', 'reconnect_needed' ] ),
  error: z.string().nullable(),
  connected_at: z.string(),
} )
export type StoredGmailAccount = z.infer< typeof StoredGmailAccount >

export const findAccount = (): StoredGmailAccount | undefined => {
  const row = getDatabase()
    .prepare( `SELECT email, refresh_token_enc, scope, status, error, connected_at
      FROM gmail_account WHERE id = 1` )
    .get()

  return row === undefined ? undefined : StoredGmailAccount.parse( row )
}

export const saveAccount = ( account: StoredGmailAccount ): void => {
  getDatabase().prepare( `INSERT INTO gmail_account (
      id, email, refresh_token_enc, scope, status, error, connected_at
    ) VALUES (
      1, @email, @refresh_token_enc, @scope, @status, @error, @connected_at
    ) ON CONFLICT ( id ) DO UPDATE SET
      email = excluded.email,
      refresh_token_enc = excluded.refresh_token_enc,
      scope = excluded.scope,
      status = excluded.status,
      error = excluded.error,
      connected_at = excluded.connected_at` ).run( account )
}

export const setAccountStatus = (
  status: StoredGmailAccount[ 'status' ],
  error: string | null,
): void => {
  getDatabase()
    .prepare( 'UPDATE gmail_account SET status = ?, error = ? WHERE id = 1' )
    .run( status, error )
}

export const deleteAccount = (): void => {
  getDatabase().prepare( 'DELETE FROM gmail_account WHERE id = 1' ).run()
}
