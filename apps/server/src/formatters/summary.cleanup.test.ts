// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { Transcript } from '@mnemosyne/shared'
// Clients
import type { SummaryResult } from '../clients/claude.client.js'
// Formatters
import { cleanSummary } from './summary.cleanup.js'

const transcript: Transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 100,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [
    { start: 0, end: 5, text: 'Rust has  an ownership' },
    { start: 5, end: 10, text: 'model that is\nunusual.' },
    { start: 10, end: 20, text: 'Memory safety comes free.' },
  ],
}

const result = ( overrides: Partial< SummaryResult > = {} ): SummaryResult => ( {
  overview: 'Overview',
  key_points: [],
  quotes: [],
  tags: [],
  ...overrides,
} )

describe( 'cleanSummary quotes', () => {
  it( 'keeps a quote that appears verbatim, ignoring whitespace differences', () => {
    const quotes = [
      { text: 'ownership model that is unusual.', seconds: 3 },
      { text: 'Memory safety comes free.', seconds: 12 },
    ]

    expect( cleanSummary( result( { quotes } ), transcript ).quotes ).toEqual( quotes )
  } )

  it( 'drops a quote that is not in the transcript', () => {
    const quotes = [
      { text: 'Memory safety comes for free.', seconds: 12 },
      { text: 'memory safety comes free.', seconds: 12 },
    ]

    expect( cleanSummary( result( { quotes } ), transcript ).quotes ).toEqual( [] )
  } )

  it( 'drops an empty quote', () => {
    const quotes = [ { text: '   ', seconds: 1 } ]

    expect( cleanSummary( result( { quotes } ), transcript ).quotes ).toEqual( [] )
  } )
} )

describe( 'cleanSummary timestamps', () => {
  const points = [
    { text: 'before', seconds: -1 },
    { text: 'start', seconds: 0 },
    { text: 'end', seconds: 100 },
    { text: 'after', seconds: 101 },
  ]

  it( 'drops key points outside 0 to the duration', () => {
    const cleaned = cleanSummary( result( { key_points: points } ), transcript )

    expect( cleaned.key_points.map( ( { text } ) => text ) ).toEqual( [ 'start', 'end' ] )
  } )

  it( 'drops quotes outside 0 to the duration', () => {
    const quotes = [
      { text: 'Memory safety comes free.', seconds: 101 },
      { text: 'Memory safety comes free.', seconds: 12 },
    ]

    expect( cleanSummary( result( { quotes } ), transcript ).quotes ).toEqual( [
      { text: 'Memory safety comes free.', seconds: 12 },
    ] )
  } )
} )

describe( 'cleanSummary tags', () => {
  const tags = ( input: string[] ): string[] => {
    return cleanSummary( result( { tags: input } ), transcript ).tags
  }

  it( 'lowercases and hyphenates spaces', () => {
    expect( tags( [ 'Machine Learning' ] ) ).toEqual( [ 'machine-learning' ] )
  } )

  it( 'strips other invalid characters', () => {
    expect( tags( [ '#Rust!', 'c++', 'a/b' ] ) ).toEqual( [ 'rust', 'c', 'ab' ] )
  } )

  it( 'collapses repeated hyphens and trims them', () => {
    expect( tags( [ ' -Deep  Learning- ' ] ) ).toEqual( [ 'deep-learning' ] )
  } )

  it( 'dedupes in order and drops mnemosyne and empties', () => {
    expect( tags( [ 'Rust', 'rust', 'Mnemosyne', '!!!', 'Go' ] ) ).toEqual( [ 'rust', 'go' ] )
  } )

  it( 'caps at five', () => {
    expect( tags( [ 'a', 'b', 'c', 'd', 'e', 'f', 'g' ] ) ).toEqual( [ 'a', 'b', 'c', 'd', 'e' ] )
  } )
} )

describe( 'cleanSummary', () => {
  it( 'keeps the overview and does not mutate its input', () => {
    const input = result( {
      key_points: [ { text: 'late', seconds: 500 } ],
      tags: [ 'Rust' ],
    } )
    const snapshot = structuredClone( input )

    const cleaned = cleanSummary( input, transcript )

    expect( cleaned.overview ).toBe( 'Overview' )
    expect( input ).toEqual( snapshot )
  } )
} )
