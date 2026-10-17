// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Errors
import {
  ConflictError,
  NotFoundError,
} from '../errors.js'
// Repositories
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Summarizer
import { SEEDED_PROFILES } from '../summarizer/prompts.js'
// Services
import {
  createProfile,
  deleteProfile,
  findProfile,
  listProfiles,
  listVersions,
  renameProfile,
  resetProfile,
  resolvePrompt,
  restoreVersion,
  saveVersion,
} from './prompts.service.js'

const byName = ( name: string ): string => {
  const profile = listProfiles().find( ( candidate ) => candidate.name === name )

  return profile?.id ?? ''
}

const defaultId = (): string => String( getSetting( 'default_profile_id' ) )

describe( 'listProfiles and findProfile', () => {
  it( 'lists the seeded profiles with their current version and reset flag', () => {
    const profiles = listProfiles()

    expect( profiles.map( ( { name, can_reset } ) => ( { name, can_reset } ) ) ).toEqual( [
      { name: 'Business ideas', can_reset: true },
      { name: 'Coding', can_reset: true },
      { name: 'General', can_reset: true },
    ] )
    expect( profiles[ 0 ]?.current_version ).toMatchObject( {
      version: 1,
      source: 'seed',
      guidance: SEEDED_PROFILES[ 0 ]?.guidance,
    } )
  } )

  it( 'finds a profile by id', () => {
    expect( findProfile( byName( 'Coding' ) ).name ).toBe( 'Coding' )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => findProfile( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )

  it( 'throws NotFoundError for a deleted profile', () => {
    deleteProfile( byName( 'Coding' ) )

    expect( () => findProfile( byName( 'Coding' ) ) ).toThrow( NotFoundError )
  } )
} )

describe( 'createProfile', () => {
  it( 'creates a profile with version 1 from an edit', () => {
    const profile = createProfile( { name: 'Research', guidance: 'Find sources.' } )

    expect( profile ).toMatchObject( { name: 'Research', can_reset: false } )
    expect( profile.current_version ).toMatchObject( {
      version: 1,
      source: 'edit',
      guidance: 'Find sources.',
    } )
    expect( listProfiles().map( ( { name } ) => name ) ).toContain( 'Research' )
  } )

  it( 'rejects a name that is taken, ignoring case', () => {
    const create = (): unknown => createProfile( { name: 'coding', guidance: 'x' } )

    expect( create ).toThrow( ConflictError )
    expect( create ).toThrow( 'A profile with that name already exists' )
    expect( listProfiles() ).toHaveLength( 3 )
  } )

  it( 'lets a deleted profile\'s name be used again', () => {
    deleteProfile( byName( 'Coding' ) )

    expect( createProfile( { name: 'Coding', guidance: 'new' } ).name ).toBe( 'Coding' )
  } )
} )

describe( 'renameProfile', () => {
  it( 'renames a profile', () => {
    expect( renameProfile( byName( 'Coding' ), 'Code' ).name ).toBe( 'Code' )
  } )

  it( 'rejects a taken name', () => {
    expect( () => renameProfile( byName( 'Coding' ), 'GENERAL' ) ).toThrow( ConflictError )
    expect( () => renameProfile( byName( 'Coding' ), 'GENERAL' ) )
      .toThrow( 'A profile with that name already exists' )
  } )

  it( 'throws NotFoundError for an unknown or deleted profile', () => {
    const id = byName( 'Coding' )
    deleteProfile( id )

    expect( () => renameProfile( id, 'X' ) ).toThrow( NotFoundError )
    expect( () => renameProfile( crypto.randomUUID(), 'X' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'deleteProfile', () => {
  it( 'soft deletes a profile and keeps its history readable', () => {
    const id = byName( 'Coding' )

    deleteProfile( id )

    expect( listProfiles().map( ( { name } ) => name ) ).not.toContain( 'Coding' )
    expect( resolvePrompt( id ).version.version ).toBe( 1 )
  } )

  it( 'refuses to delete the default profile', () => {
    expect( () => deleteProfile( defaultId() ) ).toThrow( ConflictError )
  } )

  it( 'refuses to delete the last active profile', () => {
    const business = defaultId()
    deleteProfile( byName( 'Coding' ) )
    deleteProfile( byName( 'General' ) )
    createProfile( { name: 'Other', guidance: 'x' } )
    setSetting( 'default_profile_id', byName( 'Other' ) )
    deleteProfile( business )

    expect( () => deleteProfile( byName( 'Other' ) ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => deleteProfile( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'saveVersion', () => {
  it( 'saves changed guidance as a new edit version', () => {
    const profile = saveVersion( byName( 'Coding' ), 'New guidance' )

    expect( profile.current_version ).toMatchObject( {
      version: 2,
      source: 'edit',
      guidance: 'New guidance',
    } )
  } )

  it( 'does nothing when the guidance is unchanged, after trimming', () => {
    const id = byName( 'Coding' )
    const before = findProfile( id )

    const profile = saveVersion( id, `  ${ before.current_version.guidance }\n\n` )

    expect( profile ).toEqual( before )
    expect( listVersions( id ) ).toHaveLength( 1 )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => saveVersion( crypto.randomUUID(), 'x' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'restoreVersion', () => {
  it( 'inserts a copy of the old version as the newest', () => {
    const id = byName( 'Coding' )
    const first = findProfile( id ).current_version
    saveVersion( id, 'Second' )

    const profile = restoreVersion( id, first.id )

    expect( profile.current_version ).toMatchObject( {
      version: 3,
      source: 'restore',
      guidance: first.guidance,
    } )
    expect( listVersions( id ).map( ( { version } ) => version ) ).toEqual( [ 3, 2, 1 ] )
  } )

  it( 'throws NotFoundError for a version of another profile or an unknown one', () => {
    const other = findProfile( byName( 'General' ) ).current_version

    expect( () => restoreVersion( byName( 'Coding' ), other.id ) ).toThrow( NotFoundError )
    expect( () => restoreVersion( byName( 'Coding' ), 999_999 ) ).toThrow( NotFoundError )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => restoreVersion( crypto.randomUUID(), 1 ) ).toThrow( NotFoundError )
  } )
} )

describe( 'resetProfile', () => {
  it( 'inserts the shipped guidance as a reset version', () => {
    const id = byName( 'Coding' )
    saveVersion( id, 'Changed' )

    const profile = resetProfile( id )

    expect( profile.current_version ).toMatchObject( {
      version: 3,
      source: 'reset',
      guidance: SEEDED_PROFILES[ 1 ]?.guidance,
    } )
  } )

  it( 'refuses a profile that did not ship', () => {
    const { id } = createProfile( { name: 'Mine', guidance: 'x' } )

    expect( () => resetProfile( id ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => resetProfile( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'listVersions', () => {
  it( 'lists versions newest first', () => {
    const id = byName( 'Coding' )
    saveVersion( id, 'Two' )

    expect( listVersions( id ).map( ( { version } ) => version ) ).toEqual( [ 2, 1 ] )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => listVersions( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'resolvePrompt', () => {
  beforeEach( () => {
    vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
  } )

  afterEach( () => {
    vi.restoreAllMocks()
  } )

  it( 'resolves null to the default profile\'s current version', () => {
    const { profile, version } = resolvePrompt( null )

    expect( profile.id ).toBe( defaultId() )
    expect( version.guidance ).toBe( SEEDED_PROFILES[ 0 ]?.guidance )
  } )

  it( 'resolves a profile to its current version', () => {
    const id = byName( 'Coding' )
    saveVersion( id, 'Latest' )

    const { profile, version } = resolvePrompt( id )

    expect( profile.id ).toBe( id )
    expect( version.guidance ).toBe( 'Latest' )
  } )

  it( 'still resolves a deleted profile', () => {
    const id = byName( 'Coding' )
    deleteProfile( id )

    expect( resolvePrompt( id ).profile.name ).toBe( 'Coding' )
  } )

  it( 'falls back to the default profile for a missing one, and logs', () => {
    const { profile } = resolvePrompt( crypto.randomUUID() )

    expect( profile.id ).toBe( defaultId() )
    expect( console.error ).toHaveBeenCalled()
  } )
} )
