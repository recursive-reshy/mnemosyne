// Packages
import { z } from 'zod'
// Shared
import { PromptVersion, PromptVersionSource } from '@mnemosyne/shared'
// Repositories
import { getDatabase } from './database.js'

export const ProfileRecord = z.object( {
  id: z.string(),
  name: z.string(),
  seed_key: z.string().nullable(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
} )
export type ProfileRecord = z.infer< typeof ProfileRecord >

export type NewProfile = Omit< ProfileRecord, 'deleted_at' >
export type WriteResult = { ok: true } | { ok: false, reason: 'name_taken' }

const isUniqueViolation = ( error: unknown ): boolean => {
  return error instanceof Error
    && 'code' in error
    && error.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

const writeProfile = ( write: () => void ): WriteResult => {
  try {
    write()
  } catch( error ) {
    if( isUniqueViolation( error ) ) {
      return { ok: false, reason: 'name_taken' }
    }

    throw error
  }

  return { ok: true }
}

export const listActiveProfiles = (): ProfileRecord[] => {
  return z.array( ProfileRecord ).parse( getDatabase()
    .prepare( `SELECT * FROM prompt_profiles WHERE deleted_at IS NULL
      ORDER BY lower( name ), rowid` )
    .all() )
}

export const findProfileById = ( id: string ): ProfileRecord | undefined => {
  const row = getDatabase().prepare( 'SELECT * FROM prompt_profiles WHERE id = ?' ).get( id )

  return row === undefined ? undefined : ProfileRecord.parse( row )
}

export const insertProfile = ( profile: NewProfile ): WriteResult => {
  return writeProfile( () => {
    getDatabase()
      .prepare( `INSERT INTO prompt_profiles ( id, name, seed_key, created_at )
        VALUES ( @id, @name, @seed_key, @created_at )` )
      .run( profile )
  } )
}

export const renameProfile = ( id: string, name: string ): WriteResult => {
  return writeProfile( () => {
    getDatabase().prepare( 'UPDATE prompt_profiles SET name = ? WHERE id = ?' ).run( name, id )
  } )
}

export const markProfileDeleted = ( id: string, deletedAt: string ): void => {
  getDatabase()
    .prepare( 'UPDATE prompt_profiles SET deleted_at = ? WHERE id = ?' )
    .run( deletedAt, id )
}

export const countActiveProfiles = (): number => {
  const row = getDatabase()
    .prepare( 'SELECT COUNT(*) AS count FROM prompt_profiles WHERE deleted_at IS NULL' )
    .get() as { count: number }

  return row.count
}

export const findLatestVersion = ( profileId: string ): PromptVersion | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM prompt_versions WHERE profile_id = ? ORDER BY version DESC LIMIT 1' )
    .get( profileId )

  return row === undefined ? undefined : PromptVersion.parse( row )
}

export const listVersions = ( profileId: string ): PromptVersion[] => {
  return z.array( PromptVersion ).parse( getDatabase()
    .prepare( 'SELECT * FROM prompt_versions WHERE profile_id = ? ORDER BY version DESC' )
    .all( profileId ) )
}

export const findVersionById = ( id: number ): PromptVersion | undefined => {
  const row = getDatabase().prepare( 'SELECT * FROM prompt_versions WHERE id = ?' ).get( id )

  return row === undefined ? undefined : PromptVersion.parse( row )
}

export const insertVersion = (
  profileId: string,
  guidance: string,
  source: PromptVersionSource,
): PromptVersion => {
  const db = getDatabase()

  return db.transaction( () => {
    const { next } = db
      .prepare( `SELECT COALESCE( MAX( version ), 0 ) + 1 AS next
        FROM prompt_versions WHERE profile_id = ?` )
      .get( profileId ) as { next: number }
    const { lastInsertRowid } = db
      .prepare( `INSERT INTO prompt_versions ( profile_id, version, guidance, source, created_at )
        VALUES ( ?, ?, ?, ?, ? )` )
      .run( profileId, next, guidance, source, new Date().toISOString() )

    return PromptVersion.parse(
      db.prepare( 'SELECT * FROM prompt_versions WHERE id = ?' ).get( lastInsertRowid ),
    )
  } )()
}
