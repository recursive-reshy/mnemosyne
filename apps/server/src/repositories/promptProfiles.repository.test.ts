// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import {
  countActiveProfiles,
  findLatestVersion,
  findProfileById,
  findVersionById,
  insertProfile,
  insertVersion,
  listActiveProfiles,
  listVersions,
  markProfileDeleted,
  renameProfile,
} from './promptProfiles.repository.js'

const now = '2026-10-17T10:00:00.000Z'

const addProfile = ( name: string ): string => {
  const id = crypto.randomUUID()
  const result = insertProfile( { id, name, seed_key: null, created_at: now } )

  expect( result ).toEqual( { ok: true } )

  return id
}

const seededId = ( name: string ): string => {
  const profile = listActiveProfiles().find( ( candidate ) => candidate.name === name )

  return profile?.id ?? ''
}

describe( 'listActiveProfiles', () => {
  it( 'lists the three seeded profiles by name', () => {
    expect( listActiveProfiles().map( ( { name, seed_key } ) => ( { name, seed_key } ) ) )
      .toEqual( [
        { name: 'Business ideas', seed_key: 'business' },
        { name: 'Coding', seed_key: 'coding' },
        { name: 'General', seed_key: 'general' },
      ] )
  } )

  it( 'sorts new profiles in by name, ignoring case', () => {
    addProfile( 'alpha' )
    addProfile( 'Zulu' )

    expect( listActiveProfiles().map( ( { name } ) => name ) )
      .toEqual( [ 'alpha', 'Business ideas', 'Coding', 'General', 'Zulu' ] )
  } )

  it( 'leaves out deleted profiles', () => {
    const id = addProfile( 'Temp' )

    markProfileDeleted( id, now )

    expect( listActiveProfiles().map( ( { name } ) => name ) ).not.toContain( 'Temp' )
  } )
} )

describe( 'findProfileById', () => {
  it( 'finds a profile with its fields', () => {
    const id = addProfile( 'Mine' )

    expect( findProfileById( id ) ).toEqual( {
      id,
      name: 'Mine',
      seed_key: null,
      created_at: now,
      deleted_at: null,
    } )
  } )

  it( 'still finds a deleted profile', () => {
    const id = addProfile( 'Gone' )

    markProfileDeleted( id, now )

    expect( findProfileById( id )?.deleted_at ).toBe( now )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findProfileById( crypto.randomUUID() ) ).toBeUndefined()
  } )
} )

describe( 'insertProfile and renameProfile', () => {
  it( 'reports a name taken by an active profile, ignoring case', () => {
    const result = insertProfile( {
      id: crypto.randomUUID(),
      name: 'CODING',
      seed_key: null,
      created_at: now,
    } )

    expect( result ).toEqual( { ok: false, reason: 'name_taken' } )
    expect( countActiveProfiles() ).toBe( 3 )
  } )

  it( 'lets a deleted profile\'s name be used again', () => {
    markProfileDeleted( seededId( 'Coding' ), now )

    expect( insertProfile( {
      id: crypto.randomUUID(),
      name: 'coding',
      seed_key: null,
      created_at: now,
    } ) ).toEqual( { ok: true } )
  } )

  it( 'renames a profile', () => {
    const id = addProfile( 'Old' )

    expect( renameProfile( id, 'New' ) ).toEqual( { ok: true } )
    expect( findProfileById( id )?.name ).toBe( 'New' )
  } )

  it( 'reports a rename onto another active profile\'s name', () => {
    const id = addProfile( 'Other' )

    expect( renameProfile( id, 'general' ) ).toEqual( { ok: false, reason: 'name_taken' } )
    expect( findProfileById( id )?.name ).toBe( 'Other' )
  } )

  it( 'allows changing only the case of a profile\'s own name', () => {
    const id = addProfile( 'Mine' )

    expect( renameProfile( id, 'MINE' ) ).toEqual( { ok: true } )
    expect( findProfileById( id )?.name ).toBe( 'MINE' )
  } )
} )

describe( 'markProfileDeleted and countActiveProfiles', () => {
  it( 'stamps deleted_at and drops the profile from the count', () => {
    const id = addProfile( 'Temp' )

    expect( countActiveProfiles() ).toBe( 4 )

    markProfileDeleted( id, now )

    expect( countActiveProfiles() ).toBe( 3 )
    expect( findProfileById( id )?.deleted_at ).toBe( now )
  } )
} )

describe( 'versions', () => {
  it( 'starts a seeded profile at version 1', () => {
    const latest = findLatestVersion( seededId( 'Coding' ) )

    expect( latest ).toMatchObject( { version: 1, source: 'seed' } )
  } )

  it( 'numbers new versions per profile, newest last assigned', () => {
    const coding = seededId( 'Coding' )
    const general = seededId( 'General' )

    const second = insertVersion( coding, 'one', 'edit' )
    const third = insertVersion( coding, 'two', 'restore' )
    const generalSecond = insertVersion( general, 'other', 'edit' )

    expect( [ second.version, third.version, generalSecond.version ] ).toEqual( [ 2, 3, 2 ] )
    expect( third ).toMatchObject( {
      profile_id: coding,
      guidance: 'two',
      source: 'restore',
    } )
    expect( new Date( third.created_at ).toISOString() ).toBe( third.created_at )
  } )

  it( 'starts a brand new profile at version 1', () => {
    const id = addProfile( 'Fresh' )

    expect( insertVersion( id, 'g', 'edit' ).version ).toBe( 1 )
  } )

  it( 'finds the latest version', () => {
    const coding = seededId( 'Coding' )
    insertVersion( coding, 'one', 'edit' )
    const last = insertVersion( coding, 'two', 'reset' )

    expect( findLatestVersion( coding ) ).toEqual( last )
  } )

  it( 'lists versions newest first', () => {
    const coding = seededId( 'Coding' )
    insertVersion( coding, 'one', 'edit' )
    insertVersion( coding, 'two', 'edit' )

    expect( listVersions( coding ).map( ( { version } ) => version ) ).toEqual( [ 3, 2, 1 ] )
  } )

  it( 'finds a version by id, and returns undefined for an unknown id', () => {
    const created = insertVersion( seededId( 'Coding' ), 'one', 'edit' )

    expect( findVersionById( created.id ) ).toEqual( created )
    expect( findVersionById( 999_999 ) ).toBeUndefined()
  } )

  it( 'returns no latest version for an unknown profile', () => {
    expect( findLatestVersion( crypto.randomUUID() ) ).toBeUndefined()
    expect( listVersions( crypto.randomUUID() ) ).toEqual( [] )
  } )

  it( 'refuses a version for an unknown profile', () => {
    expect( () => insertVersion( crypto.randomUUID(), 'g', 'edit' ) ).toThrow()
  } )
} )
