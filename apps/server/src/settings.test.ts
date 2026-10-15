// Packages
import { describe, it, expect } from 'vitest'
// Settings
import { getSummaryModel } from './settings.js'

describe( 'getSummaryModel', () => {
  it( 'returns the Claude Sonnet model id', () => {
    expect( getSummaryModel() ).toBe( 'claude-sonnet-5-5' )
  } )
} )
