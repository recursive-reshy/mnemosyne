// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import { getDatabase } from './database.js'
import { insertExtractionRun } from './extractionRuns.repository.js'
import type { ExtractionRunRecord } from './extractionRuns.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const buildRun = ( overrides: Partial< ExtractionRunRecord > = {} ): ExtractionRunRecord => {
  return {
    gmail_message_row: crypto.randomUUID(),
    model: 'claude-haiku-5-5',
    input_tokens: 1200,
    output_tokens: 300,
    cost_usd: 0.0021,
    outcome: 'extracted',
    postings_count: 5,
    error: null,
    created_at: '2026-10-19T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertExtractionRun', () => {
  it( 'returns the stored run with an id', () => {
    const run = buildRun()

    expect( insertExtractionRun( userId, run ) ).toEqual( { id: 1, ...run } )
  } )

  it( 'numbers the runs in order', () => {
    const first = insertExtractionRun( userId, buildRun() )
    const second = insertExtractionRun(
      userId,
      buildRun( { outcome: 'no_jobs', postings_count: 0 } ),
    )

    expect( [ first.id, second.id ] ).toEqual( [ 1, 2 ] )
  } )

  it( 'stores a failed run with its error and no usage', () => {
    const run = buildRun( {
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'failed',
      postings_count: 0,
      error: 'Malformed output',
    } )

    expect( insertExtractionRun( userId, run ) ).toEqual( { id: 1, ...run } )
  } )
} )

describe( 'ownership', () => {
  it( 'stamps each run with the user it belongs to', () => {
    const other = createTestUser().id

    insertExtractionRun( userId, buildRun() )
    insertExtractionRun( other, buildRun() )

    expect( getDatabase().prepare( 'SELECT user_id FROM extraction_runs ORDER BY id' ).all() )
      .toEqual( [ { user_id: userId }, { user_id: other } ] )
  } )
} )
