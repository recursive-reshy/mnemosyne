// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import { findLatestVersion, findProfileBySeedKey } from './promptProfiles.repository.js'
import { insertLinkRun, listLinkRuns, summarizeLinkUsage } from './linkRuns.repository.js'
import type { LinkRunRecord } from './linkRuns.repository.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const linkerVersion = (): { id: number, version: number } => {
  const profile = findProfileBySeedKey( userId, 'linker' )
  const version = findLatestVersion( userId, profile?.id ?? '' )

  if( version === undefined ) {
    throw new Error( 'The linker profile has no version' )
  }

  return version
}

const run = ( overrides: Partial< LinkRunRecord > = {} ): LinkRunRecord => {
  return {
    job_id: 'job-1',
    model: 'claude-haiku-5-5',
    prompt_version_id: linkerVersion().id,
    input_tokens: 1000,
    output_tokens: 200,
    cache_read_input_tokens: 500,
    cache_creation_input_tokens: 100,
    tool_calls: 4,
    cost_usd: 0.01,
    outcome: 'succeeded',
    error: null,
    created_at: '2026-10-21T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertLinkRun and listLinkRuns', () => {
  it( 'returns no runs for a job without any', () => {
    expect( listLinkRuns( 'job-1' ) ).toEqual( [] )
  } )

  it( 'returns the new id and round-trips a run', () => {
    const id = insertLinkRun( run() )

    expect( id ).toBeGreaterThan( 0 )
    expect( listLinkRuns( 'job-1' ) ).toEqual( [ { id, ...run() } ] )
  } )

  it( 'stores a failed run with no usage', () => {
    const failed = run( {
      input_tokens: null,
      output_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      tool_calls: null,
      cost_usd: null,
      outcome: 'failed',
      error: 'Agent service unreachable',
    } )

    insertLinkRun( failed )

    expect( listLinkRuns( 'job-1' ) ).toMatchObject( [ failed ] )
  } )

  it( 'lists the oldest run first, and only for that job', () => {
    insertLinkRun( run( { model: 'first' } ) )
    insertLinkRun( run( { job_id: 'job-2', model: 'other' } ) )
    insertLinkRun( run( { model: 'second' } ) )

    expect( listLinkRuns( 'job-1' ).map( ( { model } ) => model ) )
      .toEqual( [ 'first', 'second' ] )
  } )

  it( 'refuses a run for an unknown prompt version', () => {
    expect( () => insertLinkRun( run( { prompt_version_id: 999_999 } ) ) ).toThrow()
  } )
} )

describe( 'summarizeLinkUsage', () => {
  it( 'is undefined for a job without runs', () => {
    expect( summarizeLinkUsage( 'job-1' ) ).toBeUndefined()
  } )

  it( 'describes one run, with the prompt version number', () => {
    insertLinkRun( run() )

    expect( summarizeLinkUsage( 'job-1' ) ).toEqual( {
      last_run: {
        model: 'claude-haiku-5-5',
        prompt_version: linkerVersion().version,
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 100,
        tool_calls: 4,
        cost_usd: 0.01,
        outcome: 'succeeded',
        created_at: '2026-10-21T10:00:00.000Z',
      },
      run_count: 1,
      total_input_tokens: 1000,
      total_output_tokens: 200,
      total_cost_usd: 0.01,
    } )
  } )

  it( 'reports the last run and sums the runs of the job only', () => {
    insertLinkRun( run( { model: 'first', input_tokens: 100, output_tokens: 10, cost_usd: 0.1 } ) )
    insertLinkRun( run( { job_id: 'job-2', input_tokens: 9999 } ) )
    insertLinkRun( run( { model: 'second', input_tokens: 200, output_tokens: 20, cost_usd: 0.2 } ) )

    const usage = summarizeLinkUsage( 'job-1' )

    expect( usage?.last_run.model ).toBe( 'second' )
    expect( usage ).toMatchObject( {
      run_count: 2,
      total_input_tokens: 300,
      total_output_tokens: 30,
    } )
    expect( usage?.total_cost_usd ).toBeCloseTo( 0.3 )
  } )

  it( 'counts a failed run without usage as zero tokens and no price problem', () => {
    insertLinkRun( run() )
    insertLinkRun( run( {
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'failed',
      error: 'boom',
    } ) )

    expect( summarizeLinkUsage( 'job-1' ) ).toMatchObject( {
      run_count: 2,
      total_input_tokens: 1000,
      total_output_tokens: 200,
      total_cost_usd: 0.01,
    } )
  } )

  it( 'has no total cost when a run used tokens but has no price', () => {
    insertLinkRun( run() )
    insertLinkRun( run( { cost_usd: null } ) )

    expect( summarizeLinkUsage( 'job-1' )?.total_cost_usd ).toBeNull()
  } )
} )
