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

export const findAccount = ( userId: string ): StoredGmailAccount | undefined => {
  const row = getDatabase()
    .prepare( `SELECT email, refresh_token_enc, scope, status, error, connected_at
      FROM gmail_account WHERE user_id = ?` )
    .get( userId )

  return row === undefined ? undefined : StoredGmailAccount.parse( row )
}

export const saveAccount = ( userId: string, account: StoredGmailAccount ): void => {
  getDatabase().prepare( `INSERT INTO gmail_account (
      user_id, email, refresh_token_enc, scope, status, error, connected_at
    ) VALUES (
      @user_id, @email, @refresh_token_enc, @scope, @status, @error, @connected_at
    ) ON CONFLICT ( user_id ) DO UPDATE SET
      email = excluded.email,
      refresh_token_enc = excluded.refresh_token_enc,
      scope = excluded.scope,
      status = excluded.status,
      error = excluded.error,
      connected_at = excluded.connected_at` ).run( { ...account, user_id: userId } )
}

export const setAccountStatus = (
  userId: string,
  status: StoredGmailAccount[ 'status' ],
  error: string | null,
): void => {
  getDatabase()
    .prepare( 'UPDATE gmail_account SET status = ?, error = ? WHERE user_id = ?' )
    .run( status, error, userId )
}

export const deleteAccount = ( userId: string ): void => {
  getDatabase().prepare( 'DELETE FROM gmail_account WHERE user_id = ?' ).run( userId )
}
