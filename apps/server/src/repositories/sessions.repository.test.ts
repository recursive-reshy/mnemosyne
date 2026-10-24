// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import {
  deleteExpiredSessions,
  deleteSession,
  deleteSessionsForUser,
  findSession,
  insertSession,
  touchSession,
} from './sessions.repository.js'
import type { StoredSession } from './sessions.repository.js'
import { insertUser } from './users.repository.js'

const addUser = ( id: string ): string => {
  insertUser( {
    id,
    email: `${ id }@x.test`,
    name: id,
    role: 'member',
    status: 'active',
    created_at: '2026-10-24T10:00:00.000Z',
  } )

  return id
}

const buildSession = ( overrides: Partial< StoredSession > = {} ): StoredSession => {
  return {
    token_hash: 'hash-1',
    user_id: 'a',
    created_at: '2026-10-24T10:00:00.000Z',
    last_seen_at: '2026-10-24T10:00:00.000Z',
    expires_at: '2026-11-23T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertSession and findSession', () => {
  it( 'stores a session and finds it by hash', () => {
    addUser( 'a' )
    insertSession( buildSession() )

    expect( findSession( 'hash-1' ) ).toEqual( buildSession() )
    expect( findSession( 'other' ) ).toBeUndefined()
  } )

  it( 'refuses a session for an unknown user', () => {
    expect( () => insertSession( buildSession( { user_id: 'ghost' } ) ) ).toThrow()
  } )
} )

describe( 'touchSession', () => {
  it( 'moves last_seen_at and expires_at for that session only', () => {
    addUser( 'a' )
    insertSession( buildSession() )
    insertSession( buildSession( { token_hash: 'hash-2' } ) )

    expect( touchSession( 'hash-1', '2026-10-25T10:00:00.000Z', '2026-11-24T10:00:00.000Z' ) )
      .toBe( true )
    expect( findSession( 'hash-1' ) ).toMatchObject( {
      last_seen_at: '2026-10-25T10:00:00.000Z',
      expires_at: '2026-11-24T10:00:00.000Z',
    } )
    expect( findSession( 'hash-2' ) ).toEqual( buildSession( { token_hash: 'hash-2' } ) )
    expect( touchSession( 'nope', 'x', 'y' ) ).toBe( false )
  } )
} )

describe( 'deleteSession', () => {
  it( 'deletes one session', () => {
    addUser( 'a' )
    insertSession( buildSession() )
    insertSession( buildSession( { token_hash: 'hash-2' } ) )

    expect( deleteSession( 'hash-1' ) ).toBe( true )
    expect( deleteSession( 'hash-1' ) ).toBe( false )
    expect( findSession( 'hash-2' ) ).toBeDefined()
  } )
} )

describe( 'deleteSessionsForUser', () => {
  it( 'deletes every session of that user and no other', () => {
    addUser( 'a' )
    addUser( 'b' )
    insertSession( buildSession() )
    insertSession( buildSession( { token_hash: 'hash-2' } ) )
    insertSession( buildSession( { token_hash: 'hash-3', user_id: 'b' } ) )

    expect( deleteSessionsForUser( 'a' ) ).toBe( 2 )
    expect( findSession( 'hash-1' ) ).toBeUndefined()
    expect( findSession( 'hash-3' ) ).toBeDefined()
  } )
} )

describe( 'deleteExpiredSessions', () => {
  it( 'deletes only sessions that expired before now', () => {
    addUser( 'a' )
    insertSession( buildSession( { token_hash: 'old', expires_at: '2026-11-01T00:00:00.000Z' } ) )
    insertSession( buildSession( { token_hash: 'edge', expires_at: '2026-11-02T00:00:00.000Z' } ) )
    insertSession( buildSession( { token_hash: 'live', expires_at: '2026-11-03T00:00:00.000Z' } ) )

    expect( deleteExpiredSessions( '2026-11-02T00:00:00.000Z' ) ).toBe( 1 )
    expect( findSession( 'old' ) ).toBeUndefined()
    expect( findSession( 'edge' ) ).toBeDefined()
    expect( findSession( 'live' ) ).toBeDefined()
  } )
} )
