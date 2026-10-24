// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import {
  bindGoogleSub,
  clearVaultDir,
  countUsers,
  deleteUser,
  findUserByEmail,
  findUserById,
  insertUser,
  listUsers,
  setVaultDir,
  touchSignIn,
  updateUser,
} from './users.repository.js'
import type { NewUser } from './users.repository.js'
import { getDatabase } from './database.js'

const buildUser = ( overrides: Partial< NewUser > = {} ): NewUser => {
  return {
    id: crypto.randomUUID(),
    email: 'member@example.com',
    name: 'Member',
    role: 'member',
    status: 'active',
    created_at: '2026-10-24T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertUser', () => {
  it( 'stores the user with the sign-in fields empty and finds it by ID', () => {
    const user = buildUser()

    expect( insertUser( user ) ).toEqual( { ok: true } )
    expect( findUserById( user.id ) ).toEqual( {
      ...user,
      google_sub: null,
      vault_dir: null,
      last_signin_at: null,
    } )
  } )

  it( 'lower-cases the email', () => {
    const user = buildUser( { email: 'Mixed@Example.COM' } )

    insertUser( user )

    expect( findUserById( user.id )?.email ).toBe( 'mixed@example.com' )
  } )

  it( 'refuses a second user with the same email, whatever its case', () => {
    insertUser( buildUser() )

    expect( insertUser( buildUser( { email: 'MEMBER@example.com' } ) ) )
      .toEqual( { ok: false, reason: 'email_taken' } )
    expect( countUsers() ).toBe( 1 )
  } )

  it( 'allows one admin and many members', () => {
    expect( insertUser( buildUser( { email: 'a@x.test', role: 'admin' } ) ) )
      .toEqual( { ok: true } )
    expect( insertUser( buildUser( { email: 'b@x.test' } ) ) ).toEqual( { ok: true } )
    expect( insertUser( buildUser( { email: 'c@x.test' } ) ) ).toEqual( { ok: true } )
    expect( () => insertUser( buildUser( { email: 'd@x.test', role: 'admin' } ) ) ).toThrow()
  } )
} )

describe( 'findUserByEmail', () => {
  it( 'finds a user whatever the case of the lookup, and is undefined for others', () => {
    const user = buildUser()

    insertUser( user )

    expect( findUserByEmail( 'Member@Example.com' )?.id ).toBe( user.id )
    expect( findUserByEmail( 'other@example.com' ) ).toBeUndefined()
  } )
} )

describe( 'findUserById', () => {
  it( 'is undefined for an unknown ID', () => {
    expect( findUserById( 'nope' ) ).toBeUndefined()
  } )
} )

describe( 'bindGoogleSub', () => {
  it( 'sets the sub', () => {
    const user = buildUser()

    insertUser( user )

    expect( bindGoogleSub( user.id, 'sub-1' ) ).toEqual( { ok: true } )
    expect( findUserById( user.id )?.google_sub ).toBe( 'sub-1' )
  } )

  it( 'refuses a sub that another user already holds', () => {
    const first = buildUser( { email: 'a@x.test' } )
    const second = buildUser( { email: 'b@x.test' } )

    insertUser( first )
    insertUser( second )
    bindGoogleSub( first.id, 'sub-1' )

    expect( bindGoogleSub( second.id, 'sub-1' ) ).toEqual( { ok: false, reason: 'sub_taken' } )
    expect( findUserById( second.id )?.google_sub ).toBeNull()
  } )
} )

describe( 'setVaultDir and clearVaultDir', () => {
  it( 'sets and clears the vault folder', () => {
    const user = buildUser()

    insertUser( user )

    expect( setVaultDir( user.id, 'naresh' ) ).toEqual( { ok: true } )
    expect( findUserById( user.id )?.vault_dir ).toBe( 'naresh' )

    clearVaultDir( user.id )

    expect( findUserById( user.id )?.vault_dir ).toBeNull()
  } )

  it( 'refuses a folder another user holds and leaves the caller unchanged', () => {
    const first = buildUser( { email: 'a@x.test' } )
    const second = buildUser( { email: 'b@x.test' } )

    insertUser( first )
    insertUser( second )
    setVaultDir( first.id, 'shared' )

    expect( setVaultDir( second.id, 'shared' ) ).toEqual( { ok: false, reason: 'vault_taken' } )
    expect( findUserById( second.id )?.vault_dir ).toBeNull()
  } )

  it( 'lets a cleared folder be claimed by someone else', () => {
    const first = buildUser( { email: 'a@x.test' } )
    const second = buildUser( { email: 'b@x.test' } )

    insertUser( first )
    insertUser( second )
    setVaultDir( first.id, 'shared' )
    clearVaultDir( first.id )

    expect( setVaultDir( second.id, 'shared' ) ).toEqual( { ok: true } )
  } )
} )

describe( 'updateUser', () => {
  it( 'changes only the fields given and reports whether a row changed', () => {
    const user = buildUser()

    insertUser( user )

    expect( updateUser( user.id, { name: 'Renamed' } ) ).toBe( true )
    expect( findUserById( user.id ) ).toMatchObject( { name: 'Renamed', status: 'active' } )
    expect( updateUser( user.id, { status: 'removed' } ) ).toBe( true )
    expect( findUserById( user.id ) ).toMatchObject( { name: 'Renamed', status: 'removed' } )
  } )

  it( 'returns false for an unknown ID and for an empty change', () => {
    const user = buildUser()

    insertUser( user )

    expect( updateUser( 'nope', { name: 'x' } ) ).toBe( false )
    expect( updateUser( user.id, {} ) ).toBe( false )
  } )
} )

describe( 'touchSignIn', () => {
  it( 'records the sign-in time', () => {
    const user = buildUser()

    insertUser( user )
    touchSignIn( user.id, '2026-10-25T08:00:00.000Z' )

    expect( findUserById( user.id )?.last_signin_at ).toBe( '2026-10-25T08:00:00.000Z' )
  } )
} )

describe( 'listUsers', () => {
  it( 'lists the admin first, then members by name regardless of case', () => {
    insertUser( buildUser( { email: 'z@x.test', name: 'zed' } ) )
    insertUser( buildUser( { email: 'a@x.test', name: 'Alice' } ) )
    insertUser( buildUser( { email: 'boss@x.test', name: 'Zoe', role: 'admin' } ) )

    expect( listUsers().map( ( { name } ) => name ) ).toEqual( [ 'Zoe', 'Alice', 'zed' ] )
  } )
} )

describe( 'deleteUser', () => {
  it( 'deletes the user with their modules and sessions, and nobody else\'s', () => {
    const gone = buildUser( { email: 'gone@x.test' } )
    const kept = buildUser( { email: 'kept@x.test' } )

    insertUser( gone )
    insertUser( kept )

    const database = getDatabase()

    for( const { id } of [ gone, kept ] ) {
      database.prepare( 'INSERT INTO user_modules ( user_id, module ) VALUES ( ?, \'melete\' )' )
        .run( id )
      database.prepare( `INSERT INTO sessions (
        token_hash, user_id, created_at, last_seen_at, expires_at
      )
        VALUES ( ?, ?, 'a', 'a', 'z' )` ).run( `hash-${ id }`, id )
    }

    expect( deleteUser( gone.id ) ).toBe( true )
    expect( deleteUser( gone.id ) ).toBe( false )
    expect( database.prepare( 'SELECT user_id FROM user_modules' ).all() )
      .toEqual( [ { user_id: kept.id } ] )
    expect( database.prepare( 'SELECT user_id FROM sessions' ).all() )
      .toEqual( [ { user_id: kept.id } ] )
  } )
} )

describe( 'countUsers', () => {
  it( 'counts every user, removed ones included', () => {
    expect( countUsers() ).toBe( 0 )

    insertUser( buildUser( { email: 'a@x.test', status: 'removed' } ) )
    insertUser( buildUser( { email: 'b@x.test' } ) )

    expect( countUsers() ).toBe( 2 )
  } )
} )
