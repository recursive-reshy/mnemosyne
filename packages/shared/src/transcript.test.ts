// Packages
import { describe, it, expect } from 'vitest'
// Transcript
import { Segment, Transcript, TranscriptMeta } from './transcript.js'

const validMeta = {
  title: 'A talk',
  source: 'https://www.youtube.com/watch?v=abc',
  channel: 'Some Channel',
  duration_seconds: 120,
  transcribed_at: '2026-10-14T10:00:00.000Z',
  model: 'large-v3',
}

describe( 'Segment', () => {
  it( 'accepts a valid segment', () => {
    expect( Segment.safeParse( { start: 0, end: 2.5, text: 'Hello' } ).success ).toBe( true )
  } )

  it( 'accepts a zero-length segment', () => {
    expect( Segment.safeParse( { start: 1, end: 1, text: '' } ).success ).toBe( true )
  } )

  it( 'rejects end before start', () => {
    expect( Segment.safeParse( { start: 5, end: 2, text: 'Hello' } ).success ).toBe( false )
  } )

  it( 'rejects a negative start', () => {
    expect( Segment.safeParse( { start: -1, end: 2, text: 'Hello' } ).success ).toBe( false )
  } )

  it( 'rejects a non-string text', () => {
    expect( Segment.safeParse( { start: 0, end: 2, text: 5 } ).success ).toBe( false )
  } )
} )

describe( 'TranscriptMeta', () => {
  it( 'accepts valid metadata', () => {
    expect( TranscriptMeta.safeParse( validMeta ).success ).toBe( true )
  } )

  it( 'rejects an empty title', () => {
    expect( TranscriptMeta.safeParse( { ...validMeta, title: '' } ).success ).toBe( false )
  } )

  it( 'rejects a non-URL source', () => {
    expect( TranscriptMeta.safeParse( { ...validMeta, source: 'nope' } ).success ).toBe( false )
  } )

  it( 'rejects a negative duration_seconds', () => {
    const result = TranscriptMeta.safeParse( { ...validMeta, duration_seconds: -1 } )

    expect( result.success ).toBe( false )
  } )

  it( 'rejects a non-integer duration_seconds', () => {
    const result = TranscriptMeta.safeParse( { ...validMeta, duration_seconds: 1.5 } )

    expect( result.success ).toBe( false )
  } )

  it( 'rejects a non-ISO transcribed_at', () => {
    const result = TranscriptMeta.safeParse( { ...validMeta, transcribed_at: 'today' } )

    expect( result.success ).toBe( false )
  } )

  it( 'rejects an empty model', () => {
    expect( TranscriptMeta.safeParse( { ...validMeta, model: '' } ).success ).toBe( false )
  } )
} )

describe( 'Transcript', () => {
  it( 'accepts meta with segments', () => {
    const transcript = {
      meta: validMeta,
      segments: [ { start: 0, end: 1, text: 'Hi' } ],
    }

    expect( Transcript.safeParse( transcript ).success ).toBe( true )
  } )

  it( 'rejects an invalid segment inside', () => {
    const transcript = {
      meta: validMeta,
      segments: [ { start: 3, end: 1, text: 'Hi' } ],
    }

    expect( Transcript.safeParse( transcript ).success ).toBe( false )
  } )
} )
