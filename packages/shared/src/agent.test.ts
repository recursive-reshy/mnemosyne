// Packages
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
// Agent
import {
  InstructionsResponse,
  LinkNote,
  LinkOutcome,
  LinkRequest,
  LinkResponse,
  LinkSuggestion,
  LinkUsage,
  SuggestionKind,
} from './agent.js'

const note = { title: 'Pricing', tags: [ 'saas' ], folder: 'Ideas', body: 'Body text' }
const suggestion = {
  target: 'Pricing Strategy',
  kind: 'new_concept',
  anchor: null,
  reason: 'About pricing.',
}
const usage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  tool_calls: 1,
  turns: 2,
}
const failed = { ...{ outcome: 'failed', reason: 'Timed out', suggestions: [] } }
const response = { outcome: 'linked', reason: null, suggestions: [ suggestion ], usage }

const accepts = ( schema: z.ZodType, value: unknown ) => schema.safeParse( value ).success

const without = ( value: Record< string, unknown >, key: string ) => (
  Object.fromEntries( Object.entries( value ).filter( ( [ name ] ) => name !== key ) )
)

describe( 'LinkNote', () => {
  it( 'accepts a valid note and a null folder', () => {
    expect( accepts( LinkNote, note ) ).toBe( true )
    expect( accepts( LinkNote, { ...note, folder: null } ) ).toBe( true )
  } )

  it.each( [
    [ 'title', 1, 300 ],
    [ 'body', 1, 200_000 ],
  ] )( 'limits %s to %i..%i characters', ( field, min, max ) => {
    expect( accepts( LinkNote, { ...note, [ field ]: 'a'.repeat( min ) } ) ).toBe( true )
    expect( accepts( LinkNote, { ...note, [ field ]: 'a'.repeat( max ) } ) ).toBe( true )
    expect( accepts( LinkNote, { ...note, [ field ]: 'a'.repeat( min - 1 ) } ) ).toBe( false )
    expect( accepts( LinkNote, { ...note, [ field ]: 'a'.repeat( max + 1 ) } ) ).toBe( false )
  } )

  it( 'limits tags to fifty', () => {
    expect( accepts( LinkNote, { ...note, tags: Array( 50 ).fill( 't' ) } ) ).toBe( true )
    expect( accepts( LinkNote, { ...note, tags: Array( 51 ).fill( 't' ) } ) ).toBe( false )
  } )

  it( 'requires the folder key', () => {
    expect( accepts( LinkNote, without( note, 'folder' ) ) ).toBe( false )
  } )
} )

describe( 'LinkRequest', () => {
  const request = { note, model: 'm', guidance: '' }

  it( 'accepts a valid request', () => {
    expect( accepts( LinkRequest, request ) ).toBe( true )
  } )

  it( 'rejects an empty model', () => {
    expect( accepts( LinkRequest, { ...request, model: '' } ) ).toBe( false )
  } )

  it( 'limits guidance to 20 000 characters', () => {
    expect( accepts( LinkRequest, { ...request, guidance: 'a'.repeat( 20_000 ) } ) ).toBe( true )
    expect( accepts( LinkRequest, { ...request, guidance: 'a'.repeat( 20_001 ) } ) ).toBe( false )
  } )

  it( 'validates the nested note', () => {
    expect( accepts( LinkRequest, { ...request, note: { ...note, body: '' } } ) ).toBe( false )
  } )
} )

describe( 'LinkSuggestion', () => {
  it( 'accepts every kind and rejects an unknown one', () => {
    for( const kind of SuggestionKind.options ) {
      expect( accepts( LinkSuggestion, { ...suggestion, kind } ) ).toBe( true )
    }

    expect( accepts( LinkSuggestion, { ...suggestion, kind: 'stub' } ) ).toBe( false )
  } )

  it.each( [
    [ 'target', 200 ],
    [ 'reason', 300 ],
  ] )( 'limits %s to 1..%i characters', ( field, max ) => {
    const withField = ( length: number ) => ( { ...suggestion, [ field ]: 'a'.repeat( length ) } )

    expect( accepts( LinkSuggestion, withField( max ) ) ).toBe( true )
    expect( accepts( LinkSuggestion, withField( 0 ) ) ).toBe( false )
    expect( accepts( LinkSuggestion, withField( max + 1 ) ) ).toBe( false )
  } )

  it( 'accepts a null anchor but requires the key', () => {
    expect( accepts( LinkSuggestion, { ...suggestion, anchor: 'phrase' } ) ).toBe( true )
    expect( accepts( LinkSuggestion, without( suggestion, 'anchor' ) ) ).toBe( false )
  } )
} )

describe( 'LinkUsage', () => {
  it.each( Object.keys( usage ) )( 'requires %s', ( field ) => {
    expect( accepts( LinkUsage, usage ) ).toBe( true )
    expect( accepts( LinkUsage, without( usage, field ) ) ).toBe( false )
  } )
} )

describe( 'LinkResponse', () => {
  it( 'accepts linked with and without suggestions', () => {
    expect( accepts( LinkResponse, response ) ).toBe( true )
    expect( accepts( LinkResponse, { ...response, suggestions: [] } ) ).toBe( true )
  } )

  it( 'accepts failed with a reason and no suggestions', () => {
    expect( LinkOutcome.options ).toEqual( [ 'linked', 'failed' ] )
    expect( accepts( LinkResponse, { ...response, ...failed } ) ).toBe( true )
  } )

  it( 'rejects failed without a reason or with an empty one', () => {
    expect( accepts( LinkResponse, { ...response, ...failed, reason: null } ) ).toBe( false )
    expect( accepts( LinkResponse, { ...response, ...failed, reason: '' } ) ).toBe( false )
  } )

  it( 'rejects failed with suggestions', () => {
    const withSuggestions = { ...response, ...failed, suggestions: [ suggestion ] }

    expect( accepts( LinkResponse, withSuggestions ) ).toBe( false )
  } )

  it( 'rejects linked with a reason', () => {
    expect( accepts( LinkResponse, { ...response, reason: 'Because' } ) ).toBe( false )
  } )

  it.each( [ 'outcome', 'reason', 'suggestions', 'usage' ] )( 'requires %s', ( field ) => {
    expect( accepts( LinkResponse, without( response, field ) ) ).toBe( false )
  } )
} )

describe( 'InstructionsResponse', () => {
  it( 'accepts instructions and rejects a missing key', () => {
    expect( accepts( InstructionsResponse, { instructions: 'Do it' } ) ).toBe( true )
    expect( accepts( InstructionsResponse, {} ) ).toBe( false )
  } )
} )
