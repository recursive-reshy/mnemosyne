// Packages
import { describe, it, expect } from 'vitest'
// Summarizer
import { SHIPPED_DEFAULT_MODEL, SUMMARY_MAX_TOKENS } from './models.js'

describe( 'summarizer models', () => {
  it( 'ships Claude Sonnet 5.5 as the default model', () => {
    expect( SHIPPED_DEFAULT_MODEL ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'allows 16000 tokens per summary', () => {
    expect( SUMMARY_MAX_TOKENS ).toBe( 16_000 )
  } )
} )
