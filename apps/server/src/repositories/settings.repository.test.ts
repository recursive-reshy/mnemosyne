// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { getSetting, setSetting } from './settings.repository.js'

describe( 'getSetting', () => {
  it( 'returns undefined for a key that was never set', () => {
    expect( getSetting( 'default_model' ) ).toBeUndefined()
  } )

  it( 'returns the seeded default profile id', () => {
    expect( typeof getSetting( 'default_profile_id' ) ).toBe( 'string' )
  } )
} )

describe( 'setSetting', () => {
  it( 'stores a value that getSetting reads back', () => {
    setSetting( 'default_model', 'claude-sonnet-5-5' )

    expect( getSetting( 'default_model' ) ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'replaces an existing value', () => {
    setSetting( 'default_model', 'a' )
    setSetting( 'default_model', 'b' )

    expect( getSetting( 'default_model' ) ).toBe( 'b' )
  } )

  it( 'round-trips JSON values', () => {
    setSetting( 'shape', { list: [ 1, 'two', null ], flag: true } )

    expect( getSetting( 'shape' ) ).toEqual( { list: [ 1, 'two', null ], flag: true } )
  } )

  it( 'keeps keys apart', () => {
    setSetting( 'a', 1 )
    setSetting( 'b', 2 )

    expect( getSetting( 'a' ) ).toBe( 1 )
    expect( getSetting( 'b' ) ).toBe( 2 )
  } )
} )
