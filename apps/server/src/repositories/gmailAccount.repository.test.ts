// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import {
  deleteAccount,
  findAccount,
  saveAccount,
  setAccountStatus,
} from './gmailAccount.repository.js'
import type { StoredGmailAccount } from './gmailAccount.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const buildAccount = ( overrides: Partial< StoredGmailAccount > = {} ): StoredGmailAccount => {
  return {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:aXY=:dGFn:Y2lwaGVy',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'findAccount', () => {
  it( 'is undefined before anything is saved', () => {
    expect( findAccount( userId ) ).toBeUndefined()
  } )
} )

describe( 'saveAccount', () => {
  it( 'stores the account as given', () => {
    const account = buildAccount()

    saveAccount( userId, account )

    expect( findAccount( userId ) ).toEqual( account )
  } )

  it( 'replaces the account on a second save and keeps one row', () => {
    saveAccount( userId, buildAccount() )
    saveAccount( userId, buildAccount( {
      email: 'other@example.com',
      refresh_token_enc: 'v1:new',
      status: 'reconnect_needed',
      error: 'Revoked',
    } ) )

    expect( findAccount( userId ) ).toEqual( buildAccount( {
      email: 'other@example.com',
      refresh_token_enc: 'v1:new',
      status: 'reconnect_needed',
      error: 'Revoked',
    } ) )
  } )
} )

describe( 'setAccountStatus', () => {
  it( 'changes the status and the error and leaves the rest alone', () => {
    saveAccount( userId, buildAccount() )

    setAccountStatus( userId, 'reconnect_needed', 'Google no longer accepts access' )

    expect( findAccount( userId ) ).toEqual( buildAccount( {
      status: 'reconnect_needed',
      error: 'Google no longer accepts access',
    } ) )
  } )

  it( 'clears the error with null', () => {
    saveAccount( userId, buildAccount( { status: 'reconnect_needed', error: 'Revoked' } ) )

    setAccountStatus( userId, 'connected', null )

    expect( findAccount( userId ) ).toEqual( buildAccount() )
  } )

  it( 'does nothing when there is no account', () => {
    setAccountStatus( userId, 'reconnect_needed', 'x' )

    expect( findAccount( userId ) ).toBeUndefined()
  } )
} )

describe( 'deleteAccount', () => {
  it( 'removes the account', () => {
    saveAccount( userId, buildAccount() )

    deleteAccount( userId )

    expect( findAccount( userId ) ).toBeUndefined()
  } )

  it( 'is safe to call with no account', () => {
    expect( () => deleteAccount( userId ) ).not.toThrow()
  } )
} )

describe( 'ownership', () => {
  it( 'keeps one account per user', () => {
    const other = createTestUser().id

    saveAccount( userId, buildAccount( { email: 'mine@example.com' } ) )
    saveAccount( other, buildAccount( { email: 'theirs@example.com' } ) )

    expect( findAccount( userId )?.email ).toBe( 'mine@example.com' )
    expect( findAccount( other )?.email ).toBe( 'theirs@example.com' )
  } )

  it( 'does not show, change or delete another user\'s account', () => {
    const other = createTestUser().id

    saveAccount( userId, buildAccount() )

    expect( findAccount( other ) ).toBeUndefined()

    setAccountStatus( other, 'reconnect_needed', 'Revoked' )
    deleteAccount( other )

    expect( findAccount( userId ) ).toEqual( buildAccount() )
  } )
} )
