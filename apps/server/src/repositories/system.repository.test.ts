// Packages
import { describe, it, expect } from 'vitest'
// Test support
import { createTestUser } from '../test-support/auth.js'
// Repositories
import {
  findJobById,
  insertJob,
  updateJob,
} from './jobStore.repository.js'
import type { StoredJob } from './jobStore.repository.js'
import {
  findExpiredJobs,
  findNextRunnableJob,
  markInterruptedJobs,
  markInterruptedLinkingJobs,
} from './system.repository.js'

const buildJob = ( overrides: Partial< StoredJob > = {} ): StoredJob => {
  return {
    id: crypto.randomUUID(),
    url: 'https://www.youtube.com/watch?v=abc',
    status: 'queued',
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
    title: null,
    note_markdown: null,
    target_folder: null,
    expires_at: null,
    saved_path: null,
    summary_model: null,
    prompt_profile_id: null,
    source_document: null,
    link_state: null,
    link_error: null,
    source_type: 'video',
    feed_id: null,
    feed_name: null,
    gmail_source_id: null,
    gmail_source_name: null,
    ...overrides,
  }
}

describe( 'findNextRunnableJob', () => {
  it( 'returns the earliest-inserted queued job with its owner, skipping other statuses', () => {
    const { id: userId } = createTestUser()
    const downloading = buildJob( { status: 'downloading' } )
    const firstQueued = buildJob()
    const secondQueued = buildJob()
    insertJob( userId, downloading )
    insertJob( userId, firstQueued )
    insertJob( userId, secondQueued )

    expect( findNextRunnableJob() ).toEqual( { ...firstQueued, user_id: userId } )
  } )

  it( 'also returns summarizing jobs, oldest first', () => {
    const { id: userId } = createTestUser()
    const summarizing = buildJob( { status: 'summarizing' } )
    const queued = buildJob()
    insertJob( userId, buildJob( { status: 'ready_for_review' } ) )
    insertJob( userId, summarizing )
    insertJob( userId, queued )

    expect( findNextRunnableJob() ).toEqual( { ...summarizing, user_id: userId } )

    updateJob( userId, summarizing.id, { status: 'summary_failed' } )

    expect( findNextRunnableJob() ).toEqual( { ...queued, user_id: userId } )
  } )

  it( 'also returns linking jobs, oldest first', () => {
    const { id: userId } = createTestUser()
    const linking = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( userId, buildJob( { status: 'ready_for_review', link_state: 'linked' } ) )
    insertJob( userId, linking )
    insertJob( userId, buildJob() )

    expect( findNextRunnableJob() ).toEqual( { ...linking, user_id: userId } )
  } )

  it( 'returns undefined when no job is runnable', () => {
    const { id: userId } = createTestUser()
    insertJob( userId, buildJob( { status: 'failed' } ) )
    insertJob( userId, buildJob( { status: 'summary_failed' } ) )
    insertJob( userId, buildJob( { status: 'saved' } ) )

    expect( findNextRunnableJob() ).toBeUndefined()
  } )

  it( 'looks across users, oldest first, and says whose job it is', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const theirs = buildJob()
    const mine = buildJob()
    insertJob( second, theirs )
    insertJob( first, mine )

    expect( findNextRunnableJob() ).toEqual( { ...theirs, user_id: second } )

    updateJob( second, theirs.id, { status: 'failed' } )

    expect( findNextRunnableJob() ).toEqual( { ...mine, user_id: first } )
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
    const { id: userId } = createTestUser()
    const ids = new Map( statuses.map( ( status ) => {
      const job = buildJob( { status } )
      insertJob( userId, job )

      return [ status, job.id ] as const
    } ) )

    const count = markInterruptedJobs( 'Interrupted by restart', '2026-10-15T09:00:00.000Z' )

    expect( count ).toBe( 3 )

    for( const status of statuses ) {
      const job = findJobById( userId, ids.get( status ) ?? '' )

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

  it( 'fails the interrupted jobs of every user', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'downloading' } )
    const two = buildJob( { status: 'converting' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 2 )
    expect( findJobById( first, one.id )?.status ).toBe( 'failed' )
    expect( findJobById( second, two.id )?.status ).toBe( 'failed' )
  } )

  it( 'returns 0 when nothing was interrupted', () => {
    insertJob( createTestUser().id, buildJob() )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
  } )

  it( 'leaves a linking job alone', () => {
    const { id: userId } = createTestUser()
    const job = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( userId, job )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
    expect( findJobById( userId, job.id )?.status ).toBe( 'linking' )
  } )
} )

describe( 'markInterruptedLinkingJobs', () => {
  it( 'moves linking jobs to review as failed, and only those', () => {
    const { id: userId } = createTestUser()
    const linking = buildJob( { status: 'linking', link_state: 'pending' } )
    const summarizing = buildJob( { status: 'summarizing' } )
    insertJob( userId, linking )
    insertJob( userId, summarizing )

    const count = markInterruptedLinkingJobs(
      'Interrupted by restart',
      '2026-10-15T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
    )

    expect( count ).toBe( 1 )
    expect( findJobById( userId, linking.id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'Interrupted by restart',
      expires_at: '2026-10-16T09:00:00.000Z',
      updated_at: '2026-10-15T09:00:00.000Z',
    } )
    expect( findJobById( userId, summarizing.id )?.status ).toBe( 'summarizing' )
  } )

  it( 'covers the linking jobs of every user', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'linking', link_state: 'pending' } )
    const two = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( markInterruptedLinkingJobs(
      'x',
      '2026-10-15T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
    ) )
      .toBe( 2 )
  } )
} )

describe( 'findExpiredJobs', () => {
  const now = '2026-10-15T12:00:00.000Z'

  it( 'returns review and failed-summary jobs whose expiry has passed', () => {
    const { id: userId } = createTestUser()
    const review = buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T11:59:59.000Z',
    } )
    const failed = buildJob( { status: 'summary_failed', expires_at: now } )
    insertJob( userId, review )
    insertJob( userId, failed )

    expect( findExpiredJobs( now ).map( ( { id } ) => id ).toSorted() ).toEqual(
      [ review.id, failed.id ].toSorted(),
    )
  } )

  it( 'ignores unexpired jobs, null expiry and other statuses', () => {
    const { id: userId } = createTestUser()
    insertJob( userId, buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T12:00:01.000Z',
    } ) )
    insertJob( userId, buildJob( { status: 'ready_for_review', expires_at: null } ) )
    insertJob( userId, buildJob( { status: 'saved', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( userId, buildJob( { status: 'failed', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( userId, buildJob( {
      status: 'summarizing',
      expires_at: '2026-10-01T00:00:00.000Z',
    } ) )

    expect( findExpiredJobs( now ) ).toEqual( [] )
  } )

  it( 'returns the expired jobs of every user, each with its owner', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'ready_for_review', expires_at: '2026-10-15T10:00:00.000Z' } )
    const two = buildJob( { status: 'ready_for_review', expires_at: '2026-10-15T10:00:00.000Z' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( findExpiredJobs( now ).map( ( { id, user_id } ) => [ id, user_id ] ).toSorted() )
      .toEqual( [ [ one.id, first ], [ two.id, second ] ].toSorted() )
  } )
} )
