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
import { SourceDocument, parseNote } from '@mnemosyne/shared'
// Test support
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Summarizer
import { SEEDED_PROFILES } from '../summarizer/prompts.js'
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
      'source_document',
      'saved_path',
      'expires_at',
      'created_at',
      'updated_at',
      'note_markdown',
      'target_folder',
      'summary_model',
      'prompt_profile_id',
      'source_type',
      'feed_id',
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
    runMigrations( database, migrations.slice( 0, 3 ) )

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

describe( 'migration 4', () => {
  const insertV3 = ( database: Database.Database ): void => {
    database.prepare( `INSERT INTO jobs (
        id, url, status, title, transcript, note_markdown, target_folder, saved_path,
        expires_at, created_at, updated_at
      ) VALUES ( 'review', 'https://www.youtube.com/watch?v=abc', 'ready_for_review',
        'Video title', NULL, ?, 'Learning', NULL, '2026-10-15T10:00:00.000Z',
        '2026-10-14T10:00:00.000Z', '2026-10-14T10:00:00.000Z' )` )
      .run( '---\ntitle: "T"\n---\n\nBody\n' )
  }

  const upgrade = ( setup: ( database: Database.Database ) => void ): Database.Database => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 3 ) )
    setup( database )
    runMigrations( database, migrations.slice( 0, 4 ) )

    return database
  }

  const tableNames = ( database: Database.Database ): string[] => {
    return ( database
      .prepare( 'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name' )
      .all() as { name: string }[] ).map( ( { name } ) => name )
  }

  it( 'records user_version 4 and creates the new tables', () => {
    const database = upgrade( () => undefined )

    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 4 )
    expect( tableNames( database ) ).toEqual( expect.arrayContaining( [
      'jobs',
      'prompt_profiles',
      'prompt_versions',
      'settings',
      'summary_runs',
    ] ) )
  } )

  it( 'runs from an empty database to the same result', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 4 ) )

    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 4 )
    expect( database.prepare( 'SELECT COUNT(*) AS count FROM prompt_profiles' ).get() )
      .toEqual( { count: 3 } )
  } )

  it( 'leaves a job in review untouched and gives it empty model and profile', () => {
    const database = upgrade( insertV3 )

    expect( database.prepare( 'SELECT * FROM jobs' ).all() ).toEqual( [ {
      id: 'review',
      url: 'https://www.youtube.com/watch?v=abc',
      status: 'ready_for_review',
      error: null,
      title: 'Video title',
      transcript: null,
      saved_path: null,
      expires_at: '2026-10-15T10:00:00.000Z',
      created_at: '2026-10-14T10:00:00.000Z',
      updated_at: '2026-10-14T10:00:00.000Z',
      note_markdown: '---\ntitle: "T"\n---\n\nBody\n',
      target_folder: 'Learning',
      summary_model: null,
      prompt_profile_id: null,
    } ] )
  } )

  it( 'seeds the shipped profiles, each with version 1 from the constants', () => {
    const database = upgrade( () => undefined )

    const rows = database.prepare( `SELECT p.name, p.seed_key, p.deleted_at,
        v.version, v.guidance, v.source
      FROM prompt_profiles p JOIN prompt_versions v ON v.profile_id = p.id
      ORDER BY p.rowid` ).all()

    expect( rows ).toEqual( SEEDED_PROFILES.map( ( profile ) => ( {
      name: profile.name,
      seed_key: profile.seedKey,
      deleted_at: null,
      version: 1,
      guidance: profile.guidance,
      source: 'seed',
    } ) ) )
  } )

  it( 'makes Business ideas the default profile and leaves default_model unset', () => {
    const database = upgrade( () => undefined )

    const business = database
      .prepare( 'SELECT id FROM prompt_profiles WHERE seed_key = \'business\'' )
      .get() as { id: string }
    const settings = database.prepare( 'SELECT key, value FROM settings' ).all()

    expect( settings ).toEqual( [
      { key: 'default_profile_id', value: JSON.stringify( business.id ) },
    ] )
  } )

  it( 'gives profiles uuid ids and iso creation times', () => {
    const database = upgrade( () => undefined )

    const rows = database.prepare( 'SELECT id, created_at FROM prompt_profiles' ).all() as {
      id: string
      created_at: string
    }[]

    for( const row of rows ) {
      expect( row.id ).toMatch( /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/ )
      expect( new Date( row.created_at ).toISOString() ).toBe( row.created_at )
    }
  } )

  it( 'rejects a second active profile whose name differs only in case', () => {
    const database = upgrade( () => undefined )
    const insert = database.prepare( `INSERT INTO prompt_profiles ( id, name, created_at )
      VALUES ( ?, ?, 'now' )` )

    expect( () => insert.run( 'x', 'BUSINESS IDEAS' ) ).toThrow( /UNIQUE/ )
  } )

  it( 'allows a name to be reused once its profile is deleted', () => {
    const database = upgrade( () => undefined )
    database.prepare( 'UPDATE prompt_profiles SET deleted_at = \'now\' WHERE name = ?' )
      .run( 'Coding' )

    expect( () => database.prepare( `INSERT INTO prompt_profiles ( id, name, created_at )
      VALUES ( 'x', 'coding', 'now' )` ).run() ).not.toThrow()
  } )

  it( 'rejects a duplicate version number within one profile', () => {
    const database = upgrade( () => undefined )
    const { id } = database.prepare( 'SELECT id FROM prompt_profiles LIMIT 1' ).get() as {
      id: string
    }

    expect( () => database.prepare( `INSERT INTO prompt_versions
      ( profile_id, version, guidance, source, created_at ) VALUES ( ?, 1, 'g', 'edit', 'now' )` )
      .run( id ) ).toThrow( /UNIQUE/ )
  } )

  it( 'lets summary runs outlive their job', () => {
    const database = upgrade( () => undefined )
    const { id } = database.prepare( 'SELECT id FROM prompt_versions LIMIT 1' ).get() as {
      id: number
    }

    expect( () => database.prepare( `INSERT INTO summary_runs
      ( job_id, model, prompt_version_id, outcome, created_at )
      VALUES ( 'no-such-job', 'm', ?, 'failed', 'now' )` ).run( id ) ).not.toThrow()
  } )

  it( 'rolls back completely when seeding fails', () => {
    const database = new Database( ':memory:' )
    runMigrations( database, migrations.slice( 0, 3 ) )
    database.exec( 'CREATE TABLE settings ( blocker TEXT )' )

    expect( () => runMigrations( database, migrations ) ).toThrow()
    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 3 )
    expect( tableNames( database ) ).not.toContain( 'prompt_profiles' )
  } )
} )

describe( 'migration 5', () => {
  const upgrade = ( setup: ( database: Database.Database ) => void ): Database.Database => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 4 ) )
    setup( database )
    runMigrations( database, migrations )

    return database
  }

  const insertV4 = ( database: Database.Database ): void => {
    const insert = database.prepare( `INSERT INTO jobs (
        id, url, status, title, transcript, note_markdown, target_folder, saved_path,
        expires_at, summary_model, prompt_profile_id, created_at, updated_at
      ) VALUES ( ?, 'https://www.youtube.com/watch?v=abc', ?, 'Video title', ?, ?, 'Learning',
        ?, ?, 'claude-sonnet-5-5', NULL, '2026-10-14T10:00:00.000Z', '2026-10-14T10:00:00.000Z' )` )

    insert.run(
      'review',
      'ready_for_review',
      JSON.stringify( transcriptFixture ),
      '---\ntitle: "T"\n---\n\nBody\n',
      null,
      '2026-10-15T10:00:00.000Z',
    )
    insert.run( 'saved', 'saved', null, null, 'Learning/T.md', null )
  }

  const names = ( database: Database.Database, type: string ): string[] => {
    return ( database
      .prepare( 'SELECT name FROM sqlite_master WHERE type = ? ORDER BY name' )
      .all( type ) as { name: string }[] ).map( ( { name } ) => name )
  }

  const columnNames = ( database: Database.Database, table: string ): string[] => {
    return ( database.pragma( `table_info(${ table })` ) as { name: string }[] )
      .map( ( { name } ) => name )
  }

  it( 'records user_version 5', () => {
    const database = upgrade( () => undefined )

    expect( migrations ).toHaveLength( 5 )
    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 5 )
  } )

  it( 'runs from an empty database to the same result', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations )

    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 5 )
    expect( names( database, 'table' ) )
      .toEqual( expect.arrayContaining( [ 'feeds', 'feed_items' ] ) )
    expect( columnNames( database, 'jobs' ) ).toContain( 'source_document' )
  } )

  it( 'renames transcript to source_document and adds source_type and feed_id', () => {
    const database = upgrade( () => undefined )
    const columns = columnNames( database, 'jobs' )

    expect( columns ).toContain( 'source_document' )
    expect( columns ).toContain( 'source_type' )
    expect( columns ).toContain( 'feed_id' )
    expect( columns ).not.toContain( 'transcript' )
  } )

  it( 'tags the stored transcript of a job in review as a video document', () => {
    const database = upgrade( insertV4 )
    const { source_document: stored } = database
      .prepare( 'SELECT source_document FROM jobs WHERE id = \'review\'' )
      .get() as { source_document: string }

    const document = SourceDocument.parse( JSON.parse( stored ) )

    expect( document ).toEqual( { kind: 'video', ...transcriptFixture } )
  } )

  it( 'leaves every other column of the jobs untouched and defaults the new ones', () => {
    const database = upgrade( insertV4 )

    expect( database.prepare( 'SELECT * FROM jobs ORDER BY id' ).all() ).toEqual( [
      {
        id: 'review',
        url: 'https://www.youtube.com/watch?v=abc',
        status: 'ready_for_review',
        error: null,
        title: 'Video title',
        source_document: expect.any( String ) as string,
        note_markdown: '---\ntitle: "T"\n---\n\nBody\n',
        target_folder: 'Learning',
        saved_path: null,
        expires_at: '2026-10-15T10:00:00.000Z',
        summary_model: 'claude-sonnet-5-5',
        prompt_profile_id: null,
        created_at: '2026-10-14T10:00:00.000Z',
        updated_at: '2026-10-14T10:00:00.000Z',
        source_type: 'video',
        feed_id: null,
      },
      {
        id: 'saved',
        url: 'https://www.youtube.com/watch?v=abc',
        status: 'saved',
        error: null,
        title: 'Video title',
        source_document: null,
        note_markdown: null,
        target_folder: 'Learning',
        saved_path: 'Learning/T.md',
        expires_at: null,
        summary_model: 'claude-sonnet-5-5',
        prompt_profile_id: null,
        created_at: '2026-10-14T10:00:00.000Z',
        updated_at: '2026-10-14T10:00:00.000Z',
        source_type: 'video',
        feed_id: null,
      },
    ] )
  } )

  it( 'creates the feeds and feed_items tables with the TRD columns', () => {
    const database = upgrade( () => undefined )

    expect( columnNames( database, 'feeds' ) ).toEqual( [
      'id',
      'url',
      'feed_url',
      'name',
      'profile_id',
      'enabled',
      'auto_summarize',
      'etag',
      'last_modified',
      'last_checked_at',
      'last_error',
      'last_skipped_count',
      'created_at',
      'deleted_at',
    ] )
    expect( columnNames( database, 'feed_items' ) ).toEqual( [
      'id',
      'feed_id',
      'item_key',
      'title',
      'link',
      'published_at',
      'author',
      'content_markdown',
      'status',
      'job_id',
      'added_at',
    ] )
    expect( names( database, 'index' ) ).toEqual( expect.arrayContaining( [
      'feeds_active_url',
      'feed_items_inbox',
    ] ) )
  } )

  describe( 'feed constraints', () => {
    const addFeed = (
      database: Database.Database,
      id: string,
      feedUrl: string,
      deletedAt: string | null = null,
    ): void => {
      database.prepare( `INSERT INTO feeds ( id, url, feed_url, name, created_at, deleted_at )
        VALUES ( ?, 'https://a.example', ?, 'A', '2026-10-18T10:00:00.000Z', ? )` )
        .run( id, feedUrl, deletedAt )
    }

    it( 'defaults enabled to on, auto_summarize to off and skipped to zero', () => {
      const database = upgrade( () => undefined )

      addFeed( database, 'f1', 'https://a.example/feed' )

      expect( database.prepare( `SELECT enabled, auto_summarize, last_skipped_count
        FROM feeds` ).get() ).toEqual( { enabled: 1, auto_summarize: 0, last_skipped_count: 0 } )
    } )

    it( 'allows one active feed per feed_url, and reuse after a soft delete', () => {
      const database = upgrade( () => undefined )

      addFeed( database, 'f1', 'https://a.example/feed' )

      expect( () => addFeed( database, 'f2', 'https://a.example/feed' ) ).toThrow()

      database.prepare( 'UPDATE feeds SET deleted_at = ? WHERE id = \'f1\'' ).run( 'now' )

      expect( () => addFeed( database, 'f2', 'https://a.example/feed' ) ).not.toThrow()
    } )

    it( 'allows the same feed_url twice when one is already deleted', () => {
      const database = upgrade( () => undefined )

      addFeed( database, 'f1', 'https://a.example/feed', 'then' )

      expect( () => addFeed( database, 'f2', 'https://a.example/feed', 'then' ) ).not.toThrow()
    } )

    it( 'rejects the same item_key twice in one feed, not across feeds', () => {
      const database = upgrade( () => undefined )

      addFeed( database, 'f1', 'https://a.example/one' )
      addFeed( database, 'f2', 'https://a.example/two' )

      const insert = database.prepare( `INSERT INTO feed_items
        ( id, feed_id, item_key, title, link, status, added_at )
        VALUES ( ?, ?, 'key', 'T', 'https://a.example/p', 'inbox', 'now' )` )

      insert.run( 'i1', 'f1' )

      expect( () => insert.run( 'i2', 'f1' ) ).toThrow()
      expect( () => insert.run( 'i3', 'f2' ) ).not.toThrow()
    } )

    it( 'rejects a feed item for a feed that does not exist', () => {
      const database = upgrade( () => undefined )

      database.pragma( 'foreign_keys = ON' )

      expect( () => database.prepare( `INSERT INTO feed_items
        ( id, feed_id, item_key, title, link, status, added_at )
        VALUES ( 'i1', 'nope', 'key', 'T', 'https://a.example/p', 'inbox', 'now' )` ).run() )
        .toThrow()
    } )
  } )

  it( 'rolls back completely when a later step fails', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, migrations.slice( 0, 4 ) )
    database.exec( 'CREATE TABLE feeds ( blocker TEXT )' )

    expect( () => runMigrations( database, migrations ) ).toThrow()
    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 4 )
    expect( columnNames( database, 'jobs' ) ).toContain( 'transcript' )
    expect( columnNames( database, 'jobs' ) ).not.toContain( 'source_type' )
  } )
} )
