// Repositories
import { getDatabase } from './database.js'

export const getSetting = ( userId: string, key: string ): unknown => {
  const row = getDatabase()
    .prepare( 'SELECT value FROM settings WHERE user_id = ? AND key = ?' )
    .get( userId, key ) as { value: string } | undefined

  return row === undefined ? undefined : JSON.parse( row.value ) as unknown
}

export const setSetting = ( userId: string, key: string, value: unknown ): void => {
  getDatabase()
    .prepare( `INSERT INTO settings ( user_id, key, value ) VALUES ( ?, ?, ? )
      ON CONFLICT ( user_id, key ) DO UPDATE SET value = excluded.value` )
    .run( userId, key, JSON.stringify( value ) )
}
