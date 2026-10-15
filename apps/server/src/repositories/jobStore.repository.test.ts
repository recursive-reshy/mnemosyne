// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import {
  StoredJob,
  clearJobs,
  findJobById,
  findNextQueuedJob,
  insertJob,
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
