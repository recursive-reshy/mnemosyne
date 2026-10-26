// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import { deleteJob, insertJob } from './jobStore.repository.js'
import { findLatestVersion, listActiveProfiles } from './promptProfiles.repository.js'
import { insertSummaryRun, listRunsForJob } from './summaryRuns.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const promptVersionId = (): number => {
  const profile = listActiveProfiles( userId )[ 0 ]
  const version = findLatestVersion( userId, profile?.id ?? '' )

  return version?.id ?? 0
}

const run = ( overrides: Partial< Parameters< typeof insertSummaryRun >[ 1 ] > = {} ) => {
  return {
    job_id: 'job-1',
    model: 'claude-sonnet-5-5',
    prompt_version_id: promptVersionId(),
    input_tokens: 1000,
    output_tokens: 200,
    cost_usd: 0.01,
    outcome: 'succeeded' as const,
    error: null,
    created_at: '2026-10-17T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertSummaryRun and listRunsForJob', () => {
  it( 'returns no runs for a job without any', () => {
    expect( listRunsForJob( userId, 'job-1' ) ).toEqual( [] )
  } )

  it( 'round-trips a run', () => {
    insertSummaryRun( userId, run() )

    expect( listRunsForJob( userId, 'job-1' ) )
      .toEqual( [ { id: expect.any( Number ) as number, ...run() } ] )
  } )

  it( 'stores a failed run without tokens or cost', () => {
    const failed = run( {
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'failed',
      error: 'overloaded',
    } )

    insertSummaryRun( userId, failed )

    expect( listRunsForJob( userId, 'job-1' ) ).toMatchObject( [ failed ] )
  } )

  it( 'lists the oldest run first, and only for that job', () => {
    insertSummaryRun( userId, run( { model: 'first' } ) )
    insertSummaryRun( userId, run( { job_id: 'job-2', model: 'other' } ) )
    insertSummaryRun( userId, run( { model: 'second' } ) )

    expect( listRunsForJob( userId, 'job-1' ).map( ( { model } ) => model ) )
      .toEqual( [ 'first', 'second' ] )
  } )

  it( 'refuses a run for an unknown prompt version', () => {
    expect( () => insertSummaryRun( userId, run( { prompt_version_id: 999_999 } ) ) ).toThrow()
  } )

  it( 'keeps runs when their job is deleted', () => {
    const id = crypto.randomUUID()
    insertJob( userId, {
      id,
      url: 'https://www.youtube.com/watch?v=abc',
      status: 'queued',
      error: null,
      created_at: '2026-10-17T10:00:00.000Z',
      updated_at: '2026-10-17T10:00:00.000Z',
      title: null,
      note_markdown: null,
      target_folder: null,
      expires_at: null,
      saved_path: null,
      summary_model: null,
      prompt_profile_id: null,
      link_state: null,
      link_error: null,
      source_document: null,
      source_type: 'video',
      feed_id: null,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } )
    insertSummaryRun( userId, run( { job_id: id } ) )

    deleteJob( userId, id )

    expect( listRunsForJob( userId, id ) ).toHaveLength( 1 )
  } )
} )

describe( 'ownership', () => {
  it( 'does not show one user the runs of another user\'s job', () => {
    const other = createTestUser().id

    insertSummaryRun( userId, run() )

    expect( listRunsForJob( other, 'job-1' ) ).toEqual( [] )
    expect( listRunsForJob( userId, 'job-1' ) ).toHaveLength( 1 )
  } )

  it( 'keeps two users\' runs for the same job id apart', () => {
    const other = createTestUser().id
    const version = findLatestVersion( other, listActiveProfiles( other )[ 0 ]?.id ?? '' )

    insertSummaryRun( userId, run() )
    insertSummaryRun( other, run( { prompt_version_id: version?.id ?? 0, model: 'theirs' } ) )

    expect( listRunsForJob( userId, 'job-1' ).map( ( { model } ) => model ) )
      .toEqual( [ 'claude-sonnet-5-5' ] )
    expect( listRunsForJob( other, 'job-1' ).map( ( { model } ) => model ) ).toEqual( [ 'theirs' ] )
  } )
} )
