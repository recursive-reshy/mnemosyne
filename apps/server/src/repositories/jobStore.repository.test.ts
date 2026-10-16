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
  StoredJob,
  clearJobs,
  closeJobStore,
  deleteJob,
  findExpiredJobs,
  findJobById,
  findNextRunnableJob,
  insertJob,
  jobStoreMigrations,
  listActiveJobs,
  markInterruptedJobs,
  openJobStore,
  runMigrations,
  updateJob,
} from './jobStore.repository.js'

const buildJob = ( overrides: Partial< StoredJob > = {} ): StoredJob => {
  return {
    id: crypto.randomUUID(),
    url: 'https://www.youtube.com/watch?v=abc',
    status: 'queued',
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
    title: null,
    summary_markdown: null,
    suggested_tags: [],
    note_markdown: null,
    target_folder: null,
    expires_at: null,
    saved_path: null,
    transcript: null,
    ...overrides,
  }
}

beforeEach( () => {
  clearJobs()
} )

describe( 'insertJob and findJobById', () => {
  it( 'returns an equal job after insert', () => {
    const job = buildJob()

    insertJob( job )

    expect( findJobById( job.id ) ).toEqual( job )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findJobById( 'missing' ) ).toBeUndefined()
  } )

  it( 'throws when the id already exists', () => {
    const job = buildJob()
    insertJob( job )

    expect( () => insertJob( job ) ).toThrow()
  } )
} )

describe( 'updateJob', () => {
  it( 'merges changes and returns the updated job', () => {
    const job = buildJob()
    insertJob( job )

    const updated = updateJob( job.id, { status: 'downloading' } )

    expect( updated ).toEqual( { ...job, status: 'downloading' } )
    expect( findJobById( job.id ) ).toEqual( { ...job, status: 'downloading' } )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( updateJob( 'missing', { status: 'failed' } ) ).toBeUndefined()
  } )
} )

describe( 'findNextRunnableJob', () => {
  it( 'returns the earliest-inserted queued job, skipping other statuses', () => {
    const downloading = buildJob( { status: 'downloading' } )
    const firstQueued = buildJob()
    const secondQueued = buildJob()
    insertJob( downloading )
    insertJob( firstQueued )
    insertJob( secondQueued )

    expect( findNextRunnableJob() ).toEqual( firstQueued )
  } )

  it( 'also returns summarizing jobs, oldest first', () => {
    const summarizing = buildJob( { status: 'summarizing' } )
    const queued = buildJob()
    insertJob( buildJob( { status: 'ready_for_review' } ) )
    insertJob( summarizing )
    insertJob( queued )

    expect( findNextRunnableJob() ).toEqual( summarizing )

    updateJob( summarizing.id, { status: 'summary_failed' } )

    expect( findNextRunnableJob() ).toEqual( queued )
  } )

  it( 'returns undefined when no job is runnable', () => {
    insertJob( buildJob( { status: 'failed' } ) )
    insertJob( buildJob( { status: 'summary_failed' } ) )
    insertJob( buildJob( { status: 'saved' } ) )

    expect( findNextRunnableJob() ).toBeUndefined()
  } )
} )

describe( 'no shared references', () => {
  it( 'ignores mutation of the object passed to insertJob', () => {
    const job = buildJob()
    insertJob( job )

    job.status = 'failed'

    expect( findJobById( job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of the object returned by findJobById', () => {
    const job = buildJob()
    insertJob( job )

    const found = findJobById( job.id )
    if( found ) found.status = 'failed'

    expect( findJobById( job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of the object returned by updateJob', () => {
    const job = buildJob()
    insertJob( job )

    const updated = updateJob( job.id, { error: 'x' } )
    if( updated ) updated.error = 'changed'

    expect( findJobById( job.id )?.error ).toBe( 'x' )
  } )

  it( 'ignores mutation of the object returned by findNextRunnableJob', () => {
    const job = buildJob()
    insertJob( job )

    const next = findNextRunnableJob()
    if( next ) next.status = 'failed'

    expect( findJobById( job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of a nested transcript', () => {
    const transcript = {
      meta: {
        title: 'T',
        source: 'https://example.com/v',
        channel: 'C',
        duration_seconds: 1,
        transcribed_at: '2026-10-14T10:00:00.000Z',
        model: 'm',
      },
      segments: [ { start: 0, end: 1, text: 'hi' } ],
    }
    const job = buildJob( { transcript } )
    insertJob( job )

    transcript.segments[ 0 ].text = 'changed'

    expect( findJobById( job.id )?.transcript?.segments[ 0 ]?.text ).toBe( 'hi' )
  } )
} )

describe( 'clearJobs', () => {
  it( 'empties the store', () => {
    const job = buildJob()
    insertJob( job )

    clearJobs()

    expect( findJobById( job.id ) ).toBeUndefined()
    expect( findNextRunnableJob() ).toBeUndefined()
  } )
} )

describe( 'openJobStore and closeJobStore', () => {
  let directory = ''
  let databasePath = ''

  beforeEach( () => {
    directory = mkdtempSync( join( tmpdir(), 'mnemosyne-store-' ) )
    databasePath = join( directory, 'mnemosyne.db' )
  } )

  afterEach( () => {
    closeJobStore()
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
    openJobStore( databasePath )

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
    openJobStore( databasePath )

    const version = inspect( ( database ) => database.pragma( 'user_version', { simple: true } ) )

    expect( version ).toBe( jobStoreMigrations.length )
  } )

  it( 'turns on WAL mode', () => {
    openJobStore( databasePath )

    const mode = inspect( ( database ) => database.pragma( 'journal_mode', { simple: true } ) )

    expect( mode ).toBe( 'wal' )
  } )

  it( 'keeps existing rows and the version when opened again', () => {
    openJobStore( databasePath )
    closeJobStore()
    const writer = new Database( databasePath )
    writer
      .prepare( `INSERT INTO jobs ( id, url, status, created_at, updated_at )
        VALUES ( 'a', 'https://example.com', 'queued', 'now', 'now' )` )
      .run()
    writer.close()

    openJobStore( databasePath )

    const result = inspect( ( database ) => ( {
      rows: database.prepare( 'SELECT COUNT(*) AS count FROM jobs' ).get(),
      version: database.pragma( 'user_version', { simple: true } ),
    } ) )

    expect( result ).toEqual( { rows: { count: 1 }, version: jobStoreMigrations.length } )
  } )

  it( 'closes the previous store when opened twice', () => {
    openJobStore( databasePath )

    expect( () => openJobStore( databasePath ) ).not.toThrow()
  } )

  it( 'can be closed when nothing is open', () => {
    expect( () => closeJobStore() ).not.toThrow()
  } )
} )

describe( 'storage', () => {
  const transcript = {
    meta: {
      title: 'Ünïcode "quotes" and\nnewlines 日本語',
      source: 'https://www.youtube.com/watch?v=abc',
      channel: 'Some Channel',
      duration_seconds: 60,
      transcribed_at: '2026-10-14T10:04:00.000Z',
      model: 'large-v3',
    },
    segments: [ { start: 0, end: 1.5, text: 'Hello' } ],
  }

  beforeEach( () => {
    openJobStore( ':memory:' )
  } )

  afterEach( () => {
    closeJobStore()
  } )

  it( 'round-trips the transcript and every field', () => {
    const job = buildJob( {
      title: transcript.meta.title,
      expires_at: '2026-10-15T10:00:00.000Z',
      note_markdown: '---\ntitle: "A talk"\n---\n\nText\n',
      target_folder: 'Learning/AI',
      saved_path: 'Mnemosyne/A talk.md',
      transcript,
    } )

    insertJob( job )

    expect( findJobById( job.id ) ).toEqual( job )
  } )

  it( 'stores a null transcript when an update sets it to null', () => {
    const job = buildJob( { transcript } )
    insertJob( job )

    const updated = updateJob( job.id, { transcript: null } )

    expect( updated?.transcript ).toBeNull()
    expect( findJobById( job.id )?.transcript ).toBeNull()
  } )

  it( 'throws when a stored transcript no longer matches the schema', () => {
    const directory = mkdtempSync( join( tmpdir(), 'mnemosyne-store-' ) )
    const path = join( directory, 'mnemosyne.db' )

    try {
      openJobStore( path )
      const job = buildJob()
      insertJob( job )
      const raw = new Database( path )
      raw.prepare( 'UPDATE jobs SET transcript = ? WHERE id = ?' ).run( '{"nope":1}', job.id )
      raw.close()

      expect( () => findJobById( job.id ) ).toThrow()
    } finally {
      closeJobStore()
      rmSync( directory, { recursive: true, force: true } )
    }
  } )

  it( 'throws a clear error when the store is not open', () => {
    closeJobStore()

    expect( () => findJobById( crypto.randomUUID() ) ).toThrow( 'Job store is not open' )
  } )
} )

describe( 'markInterruptedJobs', () => {
  const statuses = [
    'queued',
    'downloading',
    'converting',
    'transcribing',
    'summarizing',
    'ready_for_review',
    'summary_failed',
    'saved',
    'failed',
  ] as const
  const interrupted = [ 'downloading', 'converting', 'transcribing' ]

  it( 'fails only the download, convert and transcribe jobs', () => {
    const ids = new Map( statuses.map( ( status ) => {
      const job = buildJob( { status } )
      insertJob( job )

      return [ status, job.id ] as const
    } ) )

    const count = markInterruptedJobs( 'Interrupted by restart', '2026-10-15T09:00:00.000Z' )

    expect( count ).toBe( 3 )

    for( const status of statuses ) {
      const job = findJobById( ids.get( status ) ?? '' )

      if( interrupted.includes( status ) ) {
        expect( job ).toMatchObject( {
          status: 'failed',
          error: 'Interrupted by restart',
          updated_at: '2026-10-15T09:00:00.000Z',
        } )
      } else {
        expect( job ).toMatchObject( { status, error: null } )
        expect( job?.updated_at ).toBe( '2026-10-14T10:00:00.000Z' )
      }
    }
  } )

  it( 'returns 0 when nothing was interrupted', () => {
    insertJob( buildJob() )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
  } )
} )

describe( 'listActiveJobs', () => {
  const active = [
    'queued',
    'downloading',
    'converting',
    'transcribing',
    'summarizing',
    'ready_for_review',
    'summary_failed',
  ] as const

  it( 'returns in-progress, review and failed-summary jobs only', () => {
    const inactive = [ 'failed', 'saved' ] as const

    for( const status of [ ...active, ...inactive ] ) {
      insertJob( buildJob( { status } ) )
    }

    const statuses = listActiveJobs().map( ( { status } ) => status )

    expect( statuses.toSorted() ).toEqual( [ ...active ].toSorted() )
  } )

  it( 'returns newest first, breaking ties by insertion order', () => {
    const old = buildJob( { created_at: '2026-10-14T10:00:00.000Z' } )
    const newer = buildJob( { created_at: '2026-10-15T10:00:00.000Z' } )
    const tieFirst = buildJob( { created_at: '2026-10-16T10:00:00.000Z' } )
    const tieSecond = buildJob( { created_at: '2026-10-16T10:00:00.000Z' } )
    for( const job of [ old, newer, tieFirst, tieSecond ] ) {
      insertJob( job )
    }

    expect( listActiveJobs().map( ( { id } ) => id ) ).toEqual( [
      tieSecond.id,
      tieFirst.id,
      newer.id,
      old.id,
    ] )
  } )

  it( 'returns an empty list for an empty store', () => {
    expect( listActiveJobs() ).toEqual( [] )
  } )
} )

describe( 'deleteJob', () => {
  it( 'removes the job and reports it', () => {
    const job = buildJob()
    insertJob( job )

    expect( deleteJob( job.id ) ).toBe( true )
    expect( findJobById( job.id ) ).toBeUndefined()
  } )

  it( 'returns false for an unknown id and leaves other jobs alone', () => {
    const other = buildJob()
    insertJob( other )

    expect( deleteJob( 'missing' ) ).toBe( false )
    expect( findJobById( other.id ) ).toEqual( other )
  } )
} )

describe( 'findExpiredJobs', () => {
  const now = '2026-10-15T12:00:00.000Z'

  it( 'returns review and failed-summary jobs whose expiry has passed', () => {
    const review = buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T11:59:59.000Z',
    } )
    const failed = buildJob( { status: 'summary_failed', expires_at: now } )
    insertJob( review )
    insertJob( failed )

    expect( findExpiredJobs( now ).map( ( { id } ) => id ).toSorted() ).toEqual(
      [ review.id, failed.id ].toSorted(),
    )
  } )

  it( 'ignores unexpired jobs, null expiry and other statuses', () => {
    insertJob( buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T12:00:01.000Z',
    } ) )
    insertJob( buildJob( { status: 'ready_for_review', expires_at: null } ) )
    insertJob( buildJob( { status: 'saved', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( buildJob( { status: 'failed', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( buildJob( { status: 'summarizing', expires_at: '2026-10-01T00:00:00.000Z' } ) )

    expect( findExpiredJobs( now ) ).toEqual( [] )
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

    runMigrations( database, jobStoreMigrations.slice( 0, 1 ) )
    setup( database )
    runMigrations( database, jobStoreMigrations )

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
      .toBe( jobStoreMigrations.length )
  } )

  it( 'rolls back when the backfill fails', () => {
    const database = new Database( ':memory:' )

    runMigrations( database, jobStoreMigrations.slice( 0, 1 ) )
    insertV1( database, 'bad', 'ready_for_review', true )
    database.prepare( 'UPDATE jobs SET transcript = ? WHERE id = ?' ).run( '{not json', 'bad' )

    expect( () => runMigrations( database, jobStoreMigrations ) ).toThrow()
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

    runMigrations( database, jobStoreMigrations.slice( 0, 2 ) )
    setup( database )
    runMigrations( database, jobStoreMigrations )

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
    runMigrations( database, jobStoreMigrations.slice( 0, 2 ) )

    expect( () => runMigrations( database, [ ...jobStoreMigrations, 'SELECT * FROM nope' ] ) )
      .toThrow()

    expect( columnNames( database ) ).toContain( 'summary_markdown' )
    expect( database.pragma( 'user_version', { simple: true } ) ).toBe( 2 )
  } )

  it( 'lets jobs be inserted, updated and read on the final table', () => {
    openJobStore( ':memory:' )
    const job = buildJob( { note_markdown: 'note', target_folder: 'A' } )

    insertJob( job )
    updateJob( job.id, { status: 'ready_for_review', note_markdown: 'edited' } )

    expect( findJobById( job.id ) ).toMatchObject( {
      status: 'ready_for_review',
      note_markdown: 'edited',
      target_folder: 'A',
    } )
  } )
} )
