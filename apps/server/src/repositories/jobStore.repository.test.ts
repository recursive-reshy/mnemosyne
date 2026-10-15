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
} from 'vitest'
// Repositories
import {
  StoredJob,
  clearJobs,
  closeJobStore,
  findJobById,
  findNextRunnableJob,
  insertJob,
  jobStoreMigrations,
  markInterruptedJobs,
  openJobStore,
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
    expect( updateJob( 'missing', { status: 'done' } ) ).toBeUndefined()
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
    insertJob( buildJob( { status: 'done' } ) )
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
      'summary_markdown',
      'suggested_tags',
      'saved_path',
      'expires_at',
      'created_at',
      'updated_at',
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

  it( 'round-trips the transcript and every summary field', () => {
    const job = buildJob( {
      title: transcript.meta.title,
      summary_markdown: '## Summary\nText',
      suggested_tags: [ 'machine-learning', 'rust' ],
      expires_at: '2026-10-15T10:00:00.000Z',
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
    'done',
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
