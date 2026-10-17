// Node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import Database from 'better-sqlite3'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
// Shared
import { parseNote } from '@mnemosyne/shared'
// Test support
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Repositories
import {
  closeDatabase,
  getDatabase,
  migrations,
  openDatabase,
  runMigrations,
} from './database.js'

describe( 'openDatabase and closeDatabase', () => {
  let directory = ''
  let databasePath = ''

  beforeEach( () => {
    directory = mkdtempSync( join( tmpdir(), 'mnemosyne-store-' ) )
    databasePath = join( directory, 'mnemosyne.db' )
  } )

  afterEach( () => {
    closeDatabase()
    rmSync( directory, { recursive: true, force: true } )
  } )

  const inspect = < Result >( read: ( database: Database.Database ) => Result ): Result => {
    const database = new Database( databasePath, { readonly: true } )

    try {
      return read( database )
    } finally {
      database.close()
    }
  }

  it( 'creates the jobs table with the columns of the TRD', () => {
    openDatabase( databasePath )

    const columns = inspect( ( database ) => {
      return database.pragma( 'table_info(jobs)' ) as { name: string, notnull: number }[]
    } )

    expect( columns.map( ( { name } ) => name ) ).toEqual( [
      'id',
      'url',
      'status',
      'error',
      'title',
      'transcript',
      'saved_path',
      'expires_at',
      'created_at',
      'updated_at',
      'note_markdown',
      'target_folder',
    ] )
  } )

  it( 'records the number of applied migrations in user_version', () => {
    openDatabase( databasePath )

    const version = inspect( ( database ) => database.pragma( 'user_version', { simple: true } ) )

    expect( version ).toBe( migrations.length )
  } )

  it( 'turns on WAL mode', () => {
    openDatabase( databasePath )

    const mode = inspect( ( database ) => database.pragma( 'journal_mode', { simple: true } ) )

    expect( mode ).toBe( 'wal' )
  } )

  it( 'keeps existing rows and the version when opened again', () => {
    openDatabase( databasePath )
    closeDatabase()
    const writer = new Database( databasePath )
    writer
      .prepare( `INSERT INTO jobs ( id, url, status, created_at, updated_at )
        VALUES ( 'a', 'https://example.com', 'queued', 'now', 'now' )` )
      .run()
    writer.close()

    openDatabase( databasePath )

    const result = inspect( ( database ) => ( {
      rows: database.prepare( 'SELECT COUNT(*) AS count FROM jobs' ).get(),
      version: database.pragma( 'user_version', { simple: true } ),
    } ) )

    expect( result ).toEqual( { rows: { count: 1 }, version: migrations.length } )
  } )

  it( 'closes the previous store when opened twice', () => {
    openDatabase( databasePath )

    expect( () => openDatabase( databasePath ) ).not.toThrow()
  } )

  it( 'can be closed when nothing is open', () => {
    expect( () => closeDatabase() ).not.toThrow()
  } )
} )

describe( 'runMigrations', () => {
  const version = ( database: Database.Database ): unknown => {
    return database.pragma( 'user_version', { simple: true } )
  }

  it( 'runs SQL strings and functions in order and records the version', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, [
      'CREATE TABLE t ( id INTEGER )',
      ( db ) => {
        db.exec( 'ALTER TABLE t ADD COLUMN name TEXT' )
        db.prepare( 'INSERT INTO t ( id, name ) VALUES ( 1, ? )' ).run( 'a' )
      },
    ] )

    expect( database.prepare( 'SELECT id, name FROM t' ).all() ).toEqual( [ { id: 1, name: 'a' } ] )
    expect( version( database ) ).toBe( 2 )
  } )

  it( 'skips migrations that were already applied', () => {
    const database = new Database( ':memory:' )
    const second = vi.fn()

    runMigrations( database, [ 'CREATE TABLE t ( id INTEGER )' ] )
    runMigrations( database, [ 'CREATE TABLE t ( id INTEGER )', second ] )

    expect( second ).toHaveBeenCalledTimes( 1 )
    expect( version( database ) ).toBe( 2 )
  } )

  it( 'rolls everything back when a function migration throws', () => {
    const database = new Database( ':memory:' )

    expect( () => runMigrations( database, [
      'CREATE TABLE t ( id INTEGER )',
      () => {
        throw new Error( 'backfill failed' )
      },
    ] ) ).toThrow( 'backfill failed' )

    expect( version( database ) ).toBe( 0 )
    expect( database.prepare( 'SELECT name FROM sqlite_master WHERE name = ?' ).get( 't' ) )
      .toBeUndefined()
  } )
} )

describe( 'migration 2', () => {
  const insertV1 = (
    database: Database.Database,
    id: string,
    status: string,
    withReview: boolean,
  ): void => {
    database.prepare( `INSERT INTO jobs (
        id, url, status, title, transcript, summary_markdown, suggested_tags,
        created_at, updated_at
      ) VALUES ( ?, 'https://www.youtube.com/watch?v=abc', ?, ?, ?, ?, ?, ?, ? )` ).run(
      id,
      status,
      'Video title',
      JSON.stringify( transcriptFixture ),
      withReview ? '## Summary\n\nText.\n\n' : null,
      JSON.stringify( withReview ? [ 'Machine Learning', 'mnemosyne', 'rust' ] : [] ),
      '2026-10-14T10:00:00.000Z',
      '2026-10-14T10:00:00.000Z',
    )
  }

  const migrate = ( setup: ( database: Database.Database ) => void ): Database.Database => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 1 ) )
    setup( database )
    runMigrations( database, migrations )

    return database
  }

  beforeEach( () => {
    vi.useFakeTimers()
    vi.setSystemTime( new Date( '2026-10-16T12:00:00.000Z' ) )
  } )

  afterEach( () => {
    vi.useRealTimers()
  } )

  it( 'adds the columns and backfills note_markdown for jobs in review', () => {
    const database = migrate( ( db ) => insertV1( db, 'review', 'ready_for_review', true ) )

    const row = database.prepare( 'SELECT * FROM jobs WHERE id = ?' ).get( 'review' ) as {
      note_markdown: string
      target_folder: string | null
    }
    const note = parseNote( row.note_markdown )

    expect( note.properties ).toEqual( {
      title: 'Video title',
      source: 'https://www.youtube.com/watch?v=abc123',
      channel: 'Channel name',
      duration: '41:12',
      created: '2026-10-16',
      tags: [ 'mnemosyne', 'machine-learning', 'rust' ],
    } )
    expect( note.body ).toBe( '## Summary\n\nText.\n' )
    expect( row.target_folder ).toBeNull()
  } )

  it( 'leaves summary_failed and saved rows null', () => {
    const database = migrate( ( db ) => {
      insertV1( db, 'failed', 'summary_failed', false )
      insertV1( db, 'saved', 'saved', true )
    } )

    const rows = database.prepare( 'SELECT note_markdown, target_folder FROM jobs' ).all()

    expect( rows ).toEqual( [
      { note_markdown: null, target_folder: null },
      { note_markdown: null, target_folder: null },
    ] )
  } )

  it( 'records the number of migrations as user_version', () => {
    const database = migrate( () => undefined )

    expect( database.pragma( 'user_version', { simple: true } ) )
      .toBe( migrations.length )
  } )

  it( 'rolls back when the backfill fails', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 1 ) )
    insertV1( database, 'bad', 'ready_for_review', true )
    database.prepare( 'UPDATE jobs SET transcript = ? WHERE id = ?' ).run( '{not json', 'bad' )

    expect( () => runMigrations( database, migrations ) ).toThrow()
    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 1 )
    expect( () => database.prepare( 'SELECT note_markdown FROM jobs' ).all() ).toThrow()
  } )
} )

describe( 'migration 3', () => {
  const insertV2 = (
    database: Database.Database,
    id: string,
    status: string,
    note: string | null,
  ): void => {
    database.prepare( `INSERT INTO jobs (
        id, url, status, title, transcript, summary_markdown, suggested_tags,
        note_markdown, target_folder, saved_path, created_at, updated_at
      ) VALUES ( ?, 'https://www.youtube.com/watch?v=abc', ?, 'Video title', NULL,
        '## Old summary', '["rust"]', ?, 'Learning', 'Mnemosyne/x.md',
        '2026-10-14T10:00:00.000Z', '2026-10-14T10:00:00.000Z' )` ).run( id, status, note )
  }

  const upgrade = ( setup: ( database: Database.Database ) => void ): Database.Database => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 2 ) )
    setup( database )
    runMigrations( database, migrations )

    return database
  }

  const columnNames = ( database: Database.Database ): string[] => {
    return ( database.pragma( 'table_info(jobs)' ) as { name: string }[] )
      .map( ( { name } ) => name )
  }

  it( 'drops summary_markdown and suggested_tags and records user_version 3', () => {
    const database = upgrade( () => undefined )

    expect( columnNames( database ) ).not.toContain( 'summary_markdown' )
    expect( columnNames( database ) ).not.toContain( 'suggested_tags' )
    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 3 )
  } )

  it( 'keeps every other column and value, for every status', () => {
    const database = upgrade( ( db ) => {
      insertV2( db, 'review', 'ready_for_review', '---\ntitle: "T"\n---\n\nBody\n' )
      insertV2( db, 'failed', 'summary_failed', null )
      insertV2( db, 'saved', 'saved', '---\ntitle: "S"\n---\n\nSaved\n' )
    } )

    const rows = database
      .prepare( 'SELECT id, status, title, note_markdown, target_folder, saved_path FROM jobs' )
      .all()

    expect( rows ).toEqual( [
      {
        id: 'review',
        status: 'ready_for_review',
        title: 'Video title',
        note_markdown: '---\ntitle: "T"\n---\n\nBody\n',
        target_folder: 'Learning',
        saved_path: 'Mnemosyne/x.md',
      },
      {
        id: 'failed',
        status: 'summary_failed',
        title: 'Video title',
        note_markdown: null,
        target_folder: 'Learning',
        saved_path: 'Mnemosyne/x.md',
      },
      {
        id: 'saved',
        status: 'saved',
        title: 'Video title',
        note_markdown: '---\ntitle: "S"\n---\n\nSaved\n',
        target_folder: 'Learning',
        saved_path: 'Mnemosyne/x.md',
      },
    ] )
  } )

  it( 'rolls back with the rest of the transaction when a later step fails', () => {
    const database = new Database( ':memory:' )
    runMigrations( database, migrations.slice( 0, 2 ) )

    expect( () => runMigrations( database, [ ...migrations, 'SELECT * FROM nope' ] ) )
      .toThrow()

    expect( columnNames( database ) ).toContain( 'summary_markdown' )
    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 2 )
  } )
} )

describe( 'getDatabase', () => {
  it( 'throws a clear error when the database is not open', () => {
    closeDatabase()

    expect( () => getDatabase() ).toThrow( 'Database is not open' )
  } )

  it( 'returns the open handle', () => {
    openDatabase( ':memory:' )

    expect( getDatabase().open ).toBe( true )
  } )
} )
