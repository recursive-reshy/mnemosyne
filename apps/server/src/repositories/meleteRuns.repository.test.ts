// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import { findLatestVersion, findProfileBySeedKey } from './promptProfiles.repository.js'
import { findRun, insertRun } from './meleteRuns.repository.js'
import type { NewMeleteRun } from './meleteRuns.repository.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const versionOf = ( seedKey: string ): number => {
  const version = findLatestVersion( userId, findProfileBySeedKey( userId, seedKey )?.id ?? '' )

  if( version === undefined ) {
    throw new Error( `The ${ seedKey } profile has no version` )
  }

  return version.id
}

const run = ( overrides: Partial< NewMeleteRun > = {} ): NewMeleteRun => {
  return {
    kind: 'generate',
    note_id: 'note-1',
    question_id: null,
    model: 'claude-haiku-5-5',
    prompt_version_id: versionOf( 'melete_questions' ),
    input_tokens: 1200,
    output_tokens: 300,
    cost_usd: 0.002,
    outcome: 'succeeded',
    error: null,
    created_at: '2026-10-22T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertRun and findRun', () => {
  it( 'stores a generation run and reads it back', () => {
    const id = insertRun( run() )

    expect( id ).toBeGreaterThan( 0 )
    expect( findRun( id ) ).toEqual( { id, ...run() } )
  } )

  it( 'stores a grading run for a question', () => {
    const id = insertRun( run( {
      kind: 'grade',
      note_id: null,
      question_id: 'question-1',
      prompt_version_id: versionOf( 'melete_grading' ),
    } ) )

    expect( findRun( id ) )
      .toMatchObject( { kind: 'grade', note_id: null, question_id: 'question-1' } )
  } )

  it( 'stores a failed run with no usage', () => {
    const id = insertRun( run( {
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'failed',
      error: 'Note is too long',
    } ) )

    expect( findRun( id ) ).toMatchObject( {
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'failed',
      error: 'Note is too long',
    } )
  } )

  it( 'numbers runs one after another', () => {
    const first = insertRun( run() )
    const second = insertRun( run() )

    expect( second ).toBe( first + 1 )
  } )

  it( 'refuses a run for an unknown prompt version', () => {
    expect( () => insertRun( run( { prompt_version_id: 999_999 } ) ) ).toThrow()
  } )

  it( 'returns undefined for an unknown run', () => {
    expect( findRun( 999_999 ) ).toBeUndefined()
  } )
} )
