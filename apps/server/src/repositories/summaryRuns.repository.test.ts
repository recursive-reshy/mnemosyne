// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { deleteJob, insertJob } from './jobStore.repository.js'
import { findLatestVersion, listActiveProfiles } from './promptProfiles.repository.js'
import { insertSummaryRun, listRunsForJob } from './summaryRuns.repository.js'

const promptVersionId = (): number => {
  const profile = listActiveProfiles()[ 0 ]
  const version = findLatestVersion( profile?.id ?? '' )

  return version?.id ?? 0
}

const run = ( overrides: Partial< Parameters< typeof insertSummaryRun >[ 0 ] > = {} ) => {
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
    expect( listRunsForJob( 'job-1' ) ).toEqual( [] )
  } )

  it( 'round-trips a run', () => {
    insertSummaryRun( run() )

    expect( listRunsForJob( 'job-1' ) )
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

    insertSummaryRun( failed )

    expect( listRunsForJob( 'job-1' ) ).toMatchObject( [ failed ] )
  } )

  it( 'lists the oldest run first, and only for that job', () => {
    insertSummaryRun( run( { model: 'first' } ) )
    insertSummaryRun( run( { job_id: 'job-2', model: 'other' } ) )
    insertSummaryRun( run( { model: 'second' } ) )

    expect( listRunsForJob( 'job-1' ).map( ( { model } ) => model ) )
      .toEqual( [ 'first', 'second' ] )
  } )

  it( 'refuses a run for an unknown prompt version', () => {
    expect( () => insertSummaryRun( run( { prompt_version_id: 999_999 } ) ) ).toThrow()
  } )

  it( 'keeps runs when their job is deleted', () => {
    const id = crypto.randomUUID()
    insertJob( {
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
      source_document: null,
      source_type: 'video',
      feed_id: null,
      feed_name: null,
    } )
    insertSummaryRun( run( { job_id: id } ) )

    deleteJob( id )

    expect( listRunsForJob( id ) ).toHaveLength( 1 )
  } )
} )
