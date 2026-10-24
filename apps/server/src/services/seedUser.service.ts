// Packages
import type Database from 'better-sqlite3'
// Errors
import { NotFoundError } from '../errors.js'
// Repositories
import { getDatabase, inTransaction } from '../repositories/database.js'
import { findUserById } from '../repositories/users.repository.js'
// Summarizer
import {
  DEFAULT_LINKER_GUIDANCE,
  LINKER_SEED_KEY,
  SEEDED_PROFILES,
} from '../summarizer/prompts.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  MELETE_GRADING_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
} from '../melete/prompts.js'

type SeedProfile = {
  name: string
  seedKey: string
  purpose: string
  guidance: string
}

const seedProfile = ( db: Database.Database, profile: SeedProfile, now: string ): string => {
  const exists = db.prepare( 'SELECT id FROM prompt_profiles WHERE seed_key = ?' )
    .get( profile.seedKey ) as { id: string } | undefined

  if( exists !== undefined ) {
    return exists.id
  }

  const taken = db.prepare( `SELECT 1 FROM prompt_profiles
    WHERE purpose = ? AND lower( name ) = lower( ? ) AND deleted_at IS NULL` )
    .get( profile.purpose, profile.name )
  const id = crypto.randomUUID()
  const name = taken === undefined ? profile.name : `${ profile.name } (seeded)`

  db.prepare( `INSERT INTO prompt_profiles ( id, name, seed_key, purpose, created_at )
    VALUES ( ?, ?, ?, ?, ? )` )
    .run( id, name, profile.seedKey, profile.purpose, now )
  db.prepare( `INSERT INTO prompt_versions
    ( profile_id, version, guidance, source, created_at ) VALUES ( ?, 1, ?, 'seed', ? )` )
    .run( id, profile.guidance, now )

  return id
}

// Until task 4.1 gives profiles an owner the rows are shared: seeded once, then left alone.
export const seedSharedProfiles = ( now: string ): void => {
  inTransaction( () => {
    const db = getDatabase()
    let businessId = ''

    for( const profile of SEEDED_PROFILES ) {
      const id = seedProfile( db, { ...profile, purpose: 'summary' }, now )

      if( profile.seedKey === 'business' ) {
        businessId = id
      }
    }

    seedProfile( db, {
      name: 'Linker',
      seedKey: LINKER_SEED_KEY,
      purpose: 'linker',
      guidance: DEFAULT_LINKER_GUIDANCE,
    }, now )
    seedProfile( db, {
      name: 'Melete questions',
      seedKey: MELETE_QUESTIONS_SEED_KEY,
      purpose: 'melete_questions',
      guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE,
    }, now )
    seedProfile( db, {
      name: 'Melete grading',
      seedKey: MELETE_GRADING_SEED_KEY,
      purpose: 'melete_grading',
      guidance: DEFAULT_MELETE_GRADING_GUIDANCE,
    }, now )

    db.prepare( 'INSERT OR IGNORE INTO settings ( key, value ) VALUES ( ?, ? )' )
      .run( 'default_profile_id', JSON.stringify( businessId ) )
  } )
}

// Gives a new user their prompt profiles and default (ADR 0065)
export const seedUser = ( userId: string, now: string ): void => {
  if( findUserById( userId ) === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  seedSharedProfiles( now )
}
