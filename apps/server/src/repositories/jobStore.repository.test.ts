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
  findNextQueuedJob,
  insertJob,
  jobStoreMigrations,
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

describe( 'findNextQueuedJob', () => {
  it( 'returns the earliest-inserted queued job, skipping other statuses', () => {
    const downloading = buildJob( { status: 'downloading' } )
    const firstQueued = buildJob()
    const secondQueued = buildJob()
    insertJob( downloading )
    insertJob( firstQueued )
    insertJob( secondQueued )

    expect( findNextQueuedJob() ).toEqual( firstQueued )
  } )

  it( 'returns undefined when no job is queued', () => {
    insertJob( buildJob( { status: 'done' } ) )

    expect( findNextQueuedJob() ).toBeUndefined()
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

  it( 'ignores mutation of the object returned by findNextQueuedJob', () => {
    const job = buildJob()
    insertJob( job )

    const next = findNextQueuedJob()
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
    expect( findNextQueuedJob() ).toBeUndefined()
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
