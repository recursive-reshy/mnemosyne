// Repositories
import { getDatabase } from './database.js'

export const getSetting = ( key: string ): unknown => {
  const row = getDatabase()
    .prepare( 'SELECT value FROM settings WHERE key = ?' )
    .get( key ) as { value: string } | undefined

  return row === undefined ? undefined : JSON.parse( row.value ) as unknown
}

export const setSetting = ( key: string, value: unknown ): void => {
  getDatabase()
    .prepare( `INSERT INTO settings ( key, value ) VALUES ( ?, ? )
      ON CONFLICT ( key ) DO UPDATE SET value = excluded.value` )
    .run( key, JSON.stringify( value ) )
}
