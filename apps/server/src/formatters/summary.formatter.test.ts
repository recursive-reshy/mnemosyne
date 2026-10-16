// Packages
import { describe, it, expect } from 'vitest'
// Clients
import type { SummaryResult } from '../clients/claude.client.js'
// Formatters
import { formatSummary } from './summary.formatter.js'

const youtube = 'https://www.youtube.com/watch?v=abc123'

const summary: SummaryResult = {
  overview: 'First paragraph.\n\nSecond paragraph.',
  key_points: [
    { text: 'Ownership is central', seconds: 754 },
    { text: 'Borrowing follows', seconds: 3920.9 },
  ],
  quotes: [ { text: 'Memory safety comes free.', seconds: 3920 } ],
  tags: [],
}

describe( 'formatSummary', () => {
  it( 'renders the three sections with YouTube timestamp links', () => {
    expect( formatSummary( summary, youtube ) ).toBe( [
      '## Summary',
      '',
      'First paragraph.',
      '',
      'Second paragraph.',
      '',
      '## Key points',
      '',
      '- Ownership is central ([12:34](https://youtu.be/abc123?t=754))',
      '- Borrowing follows ([1:05:20](https://youtu.be/abc123?t=3920))',
      '',
      '## Notable quotes',
      '',
      '> "Memory safety comes free." ([1:05:20](https://youtu.be/abc123?t=3920))',
      '',
    ].join( '\n' ) )
  } )

  it( 'uses plain timestamps for non-YouTube sources', () => {
    const body = formatSummary( summary, 'https://vimeo.com/123' )

    expect( body ).toContain( '- Ownership is central (12:34)' )
    expect( body ).toContain( '> "Memory safety comes free." (1:05:20)' )
    expect( body ).not.toContain( 'youtu.be' )
  } )

  it( 'omits empty key points and quotes sections but always writes the summary', () => {
    const body = formatSummary(
      { ...summary, key_points: [], quotes: [] },
      youtube,
    )

    expect( body ).toBe( '## Summary\n\nFirst paragraph.\n\nSecond paragraph.\n' )
  } )

  it( 'omits only the empty section', () => {
    const body = formatSummary( { ...summary, quotes: [] }, youtube )

    expect( body ).toContain( '## Key points' )
    expect( body ).not.toContain( '## Notable quotes' )
  } )

  it( 'keeps a multi-line point on one line', () => {
    const body = formatSummary(
      { ...summary, key_points: [ { text: 'Two\nlines', seconds: 5 } ], quotes: [] },
      youtube,
    )

    expect( body ).toContain( '- Two lines ([00:05](https://youtu.be/abc123?t=5))' )
  } )
} )
