// Packages
import { describe, it, expect } from 'vitest'
// Test support
import '../test-support/database.setup.js'
// Repositories
import { getDatabase } from './database.js'

// Tables that are not data: they hold users and their access (ADR 0061), not a user's content.
const USER_TABLES = [ 'users', 'user_modules', 'sessions', 'app_settings' ]

// Health rows describe either a user's own source or an app service, so `user_id` is null for the
// app kinds and only for them (ADR 0065).
const HEALTH_TABLES = [ 'health_status', 'health_errors' ]

// Data tables that don't yet carry `user_id`. Each Phase 4 task removes its tables from this
// list as it adds the column (ADR 0062); task 4.6 un-skips the test that needs it empty.
const UNCONVERTED = [
  'jobs',
  'settings',
  'prompt_profiles',
  'prompt_versions',
  'summary_runs',
  'feeds',
  'feed_items',
  'gmail_account',
  'gmail_sources',
  'gmail_messages',
  'job_postings',
  'posting_sightings',
  'extraction_runs',
  'link_runs',
  'link_suggestions',
  'health_status',
  'health_errors',
  'melete_subjects',
  'melete_notes',
  'melete_questions',
  'melete_reviews',
  'melete_runs',
]

type Column = { name: string, notnull: number }
type ForeignKey = { table: string, from: string, to: string, on_delete: string }

const tables = (): string[] => {
  return getDatabase()
    .prepare( "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'" )
    .all()
    .map( ( row ) => ( row as { name: string } ).name )
}

const userIdColumn = ( table: string ): Column | undefined => {
  return ( getDatabase().pragma( `table_info(${ table })` ) as Column[] )
    .find( ( { name } ) => name === 'user_id' )
}

const cascadesToUsers = ( table: string ): boolean => {
  return ( getDatabase().pragma( `foreign_key_list(${ table })` ) as ForeignKey[] )
    .some( ( key ) => {
      return key.from === 'user_id' && key.table === 'users' && key.to === 'id'
        && key.on_delete === 'CASCADE'
    } )
}

const dataTables = (): string[] => tables().filter( ( table ) => !USER_TABLES.includes( table ) )

describe( 'the schema guard', () => {
  it( 'knows only tables that exist', () => {
    expect( UNCONVERTED.filter( ( table ) => !tables().includes( table ) ) ).toEqual( [] )
  } )

  it( 'lists every data table once, so the starting list is complete', () => {
    expect( new Set( UNCONVERTED ).size ).toBe( UNCONVERTED.length )
    expect( dataTables().filter( ( table ) => !UNCONVERTED.includes( table ) ) )
      .toEqual( [] )
  } )

  it( 'gives users, user_modules and sessions a cascading user_id', () => {
    for( const table of [ 'user_modules', 'sessions' ] ) {
      expect( userIdColumn( table )?.notnull, table ).toBe( 1 )
      expect( cascadesToUsers( table ), table ).toBe( true )
    }
  } )

  it( 'gives every converted data table a NOT NULL user_id that cascades from users', () => {
    const converted = dataTables()
      .filter( ( table ) => !UNCONVERTED.includes( table ) && !HEALTH_TABLES.includes( table ) )

    for( const table of converted ) {
      expect( userIdColumn( table )?.notnull, `${ table }.user_id NOT NULL` ).toBe( 1 )
      expect( cascadesToUsers( table ), `${ table } cascades from users` ).toBe( true )
    }
  } )

  it( 'gives converted health tables a nullable user_id that is null for app kinds only', () => {
    for( const table of HEALTH_TABLES.filter( ( name ) => !UNCONVERTED.includes( name ) ) ) {
      expect( userIdColumn( table )?.notnull, `${ table }.user_id nullable` ).toBe( 0 )
      expect( cascadesToUsers( table ), `${ table } cascades from users` ).toBe( true )

      const sql = ( getDatabase()
        .prepare( 'SELECT sql FROM sqlite_master WHERE name = ?' )
        .get( table ) as { sql: string } ).sql

      expect( sql, `${ table } has the kind check` ).toMatch(
        /CHECK \( \( kind IN \( 'agent', 'whisper', 'backup' \) \) = \( user_id IS NULL \) \)/,
      )
    }
  } )

  it( 'drops a table from the unconverted list once it has user_id', () => {
    const stale = UNCONVERTED.filter( ( table ) => userIdColumn( table ) !== undefined )

    expect( stale, 'remove these from UNCONVERTED' ).toEqual( [] )
  } )

  // Un-skipped by task 4.6, when every data table has an owner.
  it.skip( 'has no unconverted tables left', () => {
    expect( UNCONVERTED ).toEqual( [] )
  } )
} )
