// Packages
import { describe, it, expect } from 'vitest'
// Error
import { ErrorResponse } from './error.js'

describe( 'ErrorResponse', () => {
  it( 'accepts an error alone', () => {
    expect( ErrorResponse.safeParse( { error: 'Not Found' } ).success ).toBe( true )
  } )

  it( 'accepts an error with issues', () => {
    const result = ErrorResponse.safeParse( { error: 'Invalid request', issues: [ { a: 1 } ] } )

    expect( result.success ).toBe( true )
  } )

  it( 'rejects a missing error', () => {
    expect( ErrorResponse.safeParse( { issues: [] } ).success ).toBe( false )
  } )

  it( 'rejects issues that are not an array', () => {
    expect( ErrorResponse.safeParse( { error: 'x', issues: 'nope' } ).success ).toBe( false )
  } )
} )
