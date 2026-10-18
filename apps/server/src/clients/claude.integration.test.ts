// Packages
import { describe, it, expect } from 'vitest'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

// config.ts exits the process without a key, so the client is imported only when one is set.
const hasApiKey = ( process.env.ANTHROPIC_API_KEY ?? '' ) !== ''

describe.skipIf( !hasApiKey )( 'claude.client (real Claude API)', () => {
  it( 'summarizes a short transcript into a valid, cleanable result', async () => {
    const { summarizeSource } = await import( './claude.client.js' )
    const { cleanSummary } = await import( '../formatters/summary.cleanup.js' )

    const { summary: result, usage } = await summarizeSource( {
      document: { kind: 'video', ...transcriptFixture },
      model: 'claude-sonnet-5-5',
      guidance: 'Write the overview in a few paragraphs.',
    } )
    const cleaned = cleanSummary( result, { kind: 'video', ...transcriptFixture } )

    expect( usage.input_tokens ).toBeGreaterThan( 0 )
    expect( result.overview.trim() ).not.toBe( '' )
    expect( Array.isArray( result.key_points ) ).toBe( true )
    expect( Array.isArray( result.quotes ) ).toBe( true )
    expect( cleaned.tags.length ).toBeLessThanOrEqual( 5 )
    expect( cleaned.tags ).not.toContain( 'mnemosyne' )

    if( cleaned.kind !== 'video' ) {
      throw new Error( 'Expected a video summary' )
    }

    for( const { seconds } of [ ...cleaned.key_points, ...cleaned.quotes ] ) {
      expect( seconds ).toBeGreaterThanOrEqual( 0 )
      expect( seconds ).toBeLessThanOrEqual( transcriptFixture.meta.duration_seconds )
    }
  } )
} )
