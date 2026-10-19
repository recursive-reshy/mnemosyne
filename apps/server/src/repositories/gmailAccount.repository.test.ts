// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import {
  deleteAccount,
  findAccount,
  saveAccount,
  setAccountStatus,
} from './gmailAccount.repository.js'
import type { StoredGmailAccount } from './gmailAccount.repository.js'

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
    expect( findAccount() ).toBeUndefined()
  } )
} )

describe( 'saveAccount', () => {
  it( 'stores the account as given', () => {
    const account = buildAccount()

    saveAccount( account )

    expect( findAccount() ).toEqual( account )
  } )

  it( 'replaces the account on a second save and keeps one row', () => {
    saveAccount( buildAccount() )
    saveAccount( buildAccount( {
      email: 'other@example.com',
      refresh_token_enc: 'v1:new',
      status: 'reconnect_needed',
      error: 'Revoked',
    } ) )

    expect( findAccount() ).toEqual( buildAccount( {
      email: 'other@example.com',
      refresh_token_enc: 'v1:new',
      status: 'reconnect_needed',
      error: 'Revoked',
    } ) )
  } )
} )

describe( 'setAccountStatus', () => {
  it( 'changes the status and the error and leaves the rest alone', () => {
    saveAccount( buildAccount() )

    setAccountStatus( 'reconnect_needed', 'Google no longer accepts access' )

    expect( findAccount() ).toEqual( buildAccount( {
      status: 'reconnect_needed',
      error: 'Google no longer accepts access',
    } ) )
  } )

  it( 'clears the error with null', () => {
    saveAccount( buildAccount( { status: 'reconnect_needed', error: 'Revoked' } ) )

    setAccountStatus( 'connected', null )

    expect( findAccount() ).toEqual( buildAccount() )
  } )

  it( 'does nothing when there is no account', () => {
    setAccountStatus( 'reconnect_needed', 'x' )

    expect( findAccount() ).toBeUndefined()
  } )
} )

describe( 'deleteAccount', () => {
  it( 'removes the account', () => {
    saveAccount( buildAccount() )

    deleteAccount()

    expect( findAccount() ).toBeUndefined()
  } )

  it( 'is safe to call with no account', () => {
    expect( () => deleteAccount() ).not.toThrow()
  } )
} )
