// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertUser } from '../repositories/users.repository.js'
// Services
import { seedUser } from './seedUser.service.js'
// Summarizer
import { DEFAULT_LINKER_GUIDANCE, SEEDED_PROFILES } from '../summarizer/prompts.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
} from '../melete/prompts.js'

const NOW = '2026-10-24T10:00:00.000Z'

const addUser = ( id: string, role: 'admin' | 'member' = 'member' ): string => {
  insertUser( {
    id,
    email: `${ id }@x.test`,
    name: id,
    role,
    status: 'active',
    created_at: NOW,
  } )

  return id
}

type ProfileRow = {
  name: string
  seed_key: string
  purpose: string
  guidance: string
  version: number
  source: string
}

const profiles = (): ProfileRow[] => {
  return getDatabase().prepare( `SELECT
      p.name, p.seed_key, p.purpose, v.guidance, v.version, v.source
    FROM prompt_profiles p JOIN prompt_versions v ON v.profile_id = p.id
    ORDER BY p.rowid` ).all() as ProfileRow[]
}

// The test setup seeds a throwaway user (see database.setup.ts); start these tests from nothing.
const clearSeeded = (): void => {
  getDatabase().exec( `DELETE FROM prompt_versions; DELETE FROM prompt_profiles;
    DELETE FROM settings;` )
}

describe( 'seedUser', () => {
  it( 'creates each seeded profile once, at version 1', () => {
    clearSeeded()
    seedUser( addUser( 'a' ), NOW )

    const rows = profiles()

    for( const seeded of SEEDED_PROFILES ) {
      expect( rows.filter( ( { seed_key } ) => seed_key === seeded.seedKey ) ).toEqual( [ {
        name: seeded.name,
        seed_key: seeded.seedKey,
        purpose: 'summary',
        guidance: seeded.guidance,
        version: 1,
        source: 'seed',
      } ] )
    }

    expect( rows.find( ( { seed_key } ) => seed_key === 'linker' ) ).toMatchObject( {
      name: 'Linker',
      purpose: 'linker',
      guidance: DEFAULT_LINKER_GUIDANCE,
    } )
    expect( rows.find( ( { seed_key } ) => seed_key === 'melete_questions' ) ).toMatchObject( {
      name: 'Melete questions',
      purpose: 'melete_questions',
      guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE,
    } )
    expect( rows.find( ( { seed_key } ) => seed_key === 'melete_grading' ) ).toMatchObject( {
      name: 'Melete grading',
      purpose: 'melete_grading',
      guidance: DEFAULT_MELETE_GRADING_GUIDANCE,
    } )
    expect( rows ).toHaveLength( SEEDED_PROFILES.length + 3 )
  } )

  it( 'makes Business ideas the default profile and sets nothing else', () => {
    clearSeeded()
    seedUser( addUser( 'a' ), NOW )

    const business = getDatabase()
      .prepare( "SELECT id FROM prompt_profiles WHERE seed_key = 'business'" )
      .get() as { id: string }

    expect( getDatabase().prepare( 'SELECT key, value FROM settings' ).all() ).toEqual( [
      { key: 'default_profile_id', value: JSON.stringify( business.id ) },
    ] )
  } )

  it( 'stamps the profiles with the time it is given and uuid ids', () => {
    clearSeeded()
    seedUser( addUser( 'a' ), NOW )

    const row = getDatabase().prepare( 'SELECT id, created_at FROM prompt_profiles LIMIT 1' )
      .get() as { id: string, created_at: string }

    expect( row.id ).toMatch( /^[0-9a-f-]{36}$/ )
    expect( row.created_at ).toBe( NOW )
  } )

  it( 'adds nothing a second time or for a second user, until profiles have owners', () => {
    clearSeeded()
    seedUser( addUser( 'a' ), NOW )

    const before = profiles()

    seedUser( 'a', NOW )
    seedUser( addUser( 'b' ), NOW )

    expect( profiles() ).toEqual( before )
  } )

  it( 'does not overwrite a changed default_profile_id', () => {
    clearSeeded()
    seedUser( addUser( 'a' ), NOW )
    getDatabase().prepare( `UPDATE settings SET value = '"other"'
      WHERE key = 'default_profile_id'` ).run()

    seedUser( addUser( 'b' ), NOW )

    expect( getDatabase().prepare( `SELECT value FROM settings
      WHERE key = 'default_profile_id'` ).get() ).toEqual( { value: '"other"' } )
  } )

  it( 'suffixes a seeded name that a user profile already holds', () => {
    clearSeeded()
    getDatabase().prepare( `INSERT INTO prompt_profiles ( id, name, created_at )
      VALUES ( 'mine', 'Study', 'now' )` ).run()

    seedUser( addUser( 'a' ), NOW )

    expect( getDatabase().prepare( "SELECT name FROM prompt_profiles WHERE seed_key = 'study'" )
      .all() ).toEqual( [ { name: 'Study (seeded)' } ] )
    expect( getDatabase().prepare( "SELECT name FROM prompt_profiles WHERE id = 'mine'" ).get() )
      .toEqual( { name: 'Study' } )
  } )

  it( 'skips a profile whose seed key already exists, even if renamed', () => {
    clearSeeded()
    getDatabase().prepare( `INSERT INTO prompt_profiles ( id, name, seed_key, created_at )
      VALUES ( 'mine', 'Renamed', 'study', 'now' )` ).run()

    seedUser( addUser( 'a' ), NOW )

    expect( getDatabase().prepare( `SELECT COUNT(*) AS count FROM prompt_profiles
      WHERE seed_key = 'study'` ).get() ).toEqual( { count: 1 } )
  } )

  it( 'writes nothing when it fails part-way', () => {
    clearSeeded()
    getDatabase().exec( `CREATE TRIGGER fail_linker BEFORE INSERT ON prompt_profiles
      WHEN NEW.seed_key = 'linker' BEGIN SELECT RAISE( ABORT, 'boom' ); END;` )

    expect( () => seedUser( addUser( 'a' ), NOW ) ).toThrow( 'boom' )
    expect( profiles() ).toEqual( [] )
    expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM settings' ).get() )
      .toEqual( { count: 0 } )
  } )
} )

describe( 'seedUser for an unknown user', () => {
  it( 'throws not found and seeds nothing', () => {
    clearSeeded()

    expect( () => seedUser( 'ghost', NOW ) ).toThrow( 'User not found' )
    expect( profiles() ).toEqual( [] )
  } )
} )
