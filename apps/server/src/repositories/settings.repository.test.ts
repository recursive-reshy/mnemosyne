// Packages
import {
  beforeEach,
  describe,
  it,
  expect,
} from 'vitest'
// Repositories
import { getSetting, setSetting } from './settings.repository.js'
// Test support
import { createTestUser } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = createTestUser().id
} )

describe( 'getSetting', () => {
  it( 'returns undefined for a key that was never set', () => {
    expect( getSetting( userId, 'default_model' ) ).toBeUndefined()
  } )

  it( 'returns the seeded default profile id', () => {
    expect( typeof getSetting( userId, 'default_profile_id' ) ).toBe( 'string' )
  } )
} )

describe( 'setSetting', () => {
  it( 'stores a value that getSetting reads back', () => {
    setSetting( userId, 'default_model', 'claude-sonnet-5-5' )

    expect( getSetting( userId, 'default_model' ) ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'replaces an existing value', () => {
    setSetting( userId, 'default_model', 'a' )
    setSetting( userId, 'default_model', 'b' )

    expect( getSetting( userId, 'default_model' ) ).toBe( 'b' )
  } )

  it( 'round-trips JSON values', () => {
    setSetting( userId, 'shape', { list: [ 1, 'two', null ], flag: true } )

    expect( getSetting( userId, 'shape' ) ).toEqual( { list: [ 1, 'two', null ], flag: true } )
  } )

  it( 'keeps keys apart', () => {
    setSetting( userId, 'a', 1 )
    setSetting( userId, 'b', 2 )

    expect( getSetting( userId, 'a' ) ).toBe( 1 )
    expect( getSetting( userId, 'b' ) ).toBe( 2 )
  } )
} )

describe( 'ownership', () => {
  it( 'keeps each user\'s value for the same key', () => {
    const other = createTestUser().id

    setSetting( userId, 'default_model', 'mine' )
    setSetting( other, 'default_model', 'theirs' )

    expect( getSetting( userId, 'default_model' ) ).toBe( 'mine' )
    expect( getSetting( other, 'default_model' ) ).toBe( 'theirs' )
  } )

  it( 'does not show one user a key only another has set', () => {
    setSetting( userId, 'linking_model', 'mine' )

    expect( getSetting( createTestUser().id, 'linking_model' ) ).toBeUndefined()
  } )

  it( 'gives each user their own default profile', () => {
    const other = createTestUser().id

    expect( getSetting( other, 'default_profile_id' ) )
      .not.toBe( getSetting( userId, 'default_profile_id' ) )
  } )
} )
