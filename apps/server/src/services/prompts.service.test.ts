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
  ValidationError,
} from '../errors.js'
// Repositories
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Summarizer
import { DEFAULT_LINKER_GUIDANCE, SEEDED_PROFILES } from '../summarizer/prompts.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
} from '../melete/prompts.js'
// Services
import {
  assertActiveProfile,
  createProfile,
  deleteProfile,
  findProfile,
  listProfiles,
  listVersions,
  renameProfile,
  resetProfile,
  resolveLinkerPrompt,
  resolvePrompt,
  restoreVersion,
  saveVersion,
} from './prompts.service.js'
// Logging
import { logger } from '../logger.js'

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
      { name: 'Study', can_reset: true },
    ] )
    expect( profiles.every( ( { purpose } ) => purpose === 'summary' ) ).toBe( true )
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
    expect( listProfiles() ).toHaveLength( 4 )
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
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
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
    expect( logger.error ).toHaveBeenCalled()
  } )
} )

describe( 'assertActiveProfile', () => {
  it( 'accepts an active profile', () => {
    expect( () => assertActiveProfile( byName( 'Coding' ) ) ).not.toThrow()
  } )

  it( 'rejects an unknown and a deleted profile with a ValidationError', () => {
    const id = byName( 'Coding' )
    deleteProfile( id )

    expect( () => assertActiveProfile( id ) ).toThrow( ValidationError )
    expect( () => assertActiveProfile( crypto.randomUUID() ) ).toThrow( ValidationError )
  } )
} )

describe( 'resolveLinkerPrompt', () => {
  it( 'returns the linker profile and its current version', () => {
    const { profile, version } = resolveLinkerPrompt()

    expect( profile.name ).toBe( 'Linker' )
    expect( version.guidance ).toBe( DEFAULT_LINKER_GUIDANCE )
    expect( version.id ).toBe( profile.current_version.id )
  } )

  it( 'follows a newer version of the linker prompt', () => {
    const { profile } = resolveLinkerPrompt()

    saveVersion( profile.id, 'Link fewer things.' )

    expect( resolveLinkerPrompt().version ).toMatchObject( {
      version: 2,
      guidance: 'Link fewer things.',
    } )
  } )
} )

describe( 'the linker profile', () => {
  const linkerId = (): string => resolveLinkerPrompt().profile.id

  it( 'is left out of the profile list and does not take a summary profile\'s name', () => {
    expect( listProfiles().map( ( { name } ) => name ) ).not.toContain( 'Linker' )
    expect( createProfile( { name: 'Linker', guidance: 'Mine.' } ).name ).toBe( 'Linker' )
    expect( resolveLinkerPrompt().profile.name ).toBe( 'Linker' )
  } )

  it( 'can reset, so the app can show a reset action', () => {
    expect( findProfile( linkerId() ) ).toMatchObject( { name: 'Linker', can_reset: true } )
    expect( findProfile( linkerId() ).purpose ).toBe( 'linker' )
  } )

  it( 'cannot be renamed or deleted', () => {
    const message = 'The linker prompt can\'t be renamed or deleted'

    expect( () => renameProfile( linkerId(), 'Other' ) ).toThrow( new ConflictError( message ) )
    expect( () => deleteProfile( linkerId() ) ).toThrow( new ConflictError( message ) )
    expect( findProfile( linkerId() ).name ).toBe( 'Linker' )
  } )

  it( 'keeps its history: save, list, restore', () => {
    saveVersion( linkerId(), 'Link only people.' )
    const versions = listVersions( linkerId() )

    expect( versions.map( ( { version, source } ) => ( { version, source } ) ) )
      .toEqual( [ { version: 2, source: 'edit' }, { version: 1, source: 'seed' } ] )

    const restored = restoreVersion( linkerId(), versions[ 1 ]?.id ?? 0 )

    expect( restored.current_version )
      .toMatchObject( { version: 3, source: 'restore', guidance: DEFAULT_LINKER_GUIDANCE } )
  } )

  it( 'resets to the default linker guidance', () => {
    saveVersion( linkerId(), 'Link only people.' )

    expect( resetProfile( linkerId() ).current_version ).toMatchObject( {
      version: 3,
      source: 'reset',
      guidance: DEFAULT_LINKER_GUIDANCE,
    } )
  } )

  it( 'is refused where a summary profile is chosen', () => {
    expect( () => assertActiveProfile( linkerId() ) ).toThrow( ValidationError )
  } )

  it( 'is never used for a summary: resolvePrompt falls back to the default profile', () => {
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    expect( resolvePrompt( linkerId() ).profile.id ).toBe( defaultId() )
  } )
} )

describe( 'listProfiles by purpose', () => {
  it( 'lists summary profiles unless told otherwise', () => {
    expect( listProfiles().every( ( { purpose } ) => purpose === 'summary' ) ).toBe( true )
    expect( listProfiles( 'summary' ) ).toEqual( listProfiles() )
  } )

  it( 'lists one other purpose', () => {
    expect( listProfiles( 'melete_grading' ).map( ( { name } ) => name ) )
      .toEqual( [ 'Melete grading' ] )
    expect( listProfiles( 'linker' ).map( ( { name } ) => name ) ).toEqual( [ 'Linker' ] )
  } )

  it( 'lists every purpose, summary first, with the purpose on each', () => {
    expect( listProfiles( 'all' ).map( ( { name, purpose } ) => [ name, purpose ] ) ).toEqual( [
      [ 'Business ideas', 'summary' ],
      [ 'Coding', 'summary' ],
      [ 'General', 'summary' ],
      [ 'Study', 'summary' ],
      [ 'Linker', 'linker' ],
      [ 'Melete questions', 'melete_questions' ],
      [ 'Melete grading', 'melete_grading' ],
    ] )
  } )
} )

describe( 'the Melete profiles', () => {
  const questionsId = (): string => listProfiles( 'melete_questions' )[ 0 ]?.id ?? ''
  const gradingId = (): string => listProfiles( 'melete_grading' )[ 0 ]?.id ?? ''
  const message = 'The Melete prompts can\'t be renamed or deleted'

  it( 'cannot be renamed or deleted', () => {
    expect( () => renameProfile( questionsId(), 'Other' ) )
      .toThrow( new ConflictError( message ) )
    expect( () => deleteProfile( gradingId() ) ).toThrow( new ConflictError( message ) )
    expect( findProfile( gradingId() ).name ).toBe( 'Melete grading' )
  } )

  it( 'save, restore and reset like any profile', () => {
    const id = questionsId()
    const first = findProfile( id ).current_version

    saveVersion( id, 'Ask about trade-offs.' )
    restoreVersion( id, first.id )

    expect( findProfile( id ).current_version )
      .toMatchObject( { source: 'restore', guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE } )

    saveVersion( id, 'Ask about trade-offs.' )

    expect( resetProfile( id ).current_version )
      .toMatchObject( { source: 'reset', guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE } )
    expect( resetProfile( gradingId() ).current_version )
      .toMatchObject( { source: 'reset', guidance: DEFAULT_MELETE_GRADING_GUIDANCE } )
    expect( listVersions( id ) ).toHaveLength( 5 )
  } )

  it( 'are not summary profiles', () => {
    expect( () => assertActiveProfile( questionsId() ) )
      .toThrow( new ValidationError( 'Unknown prompt profile' ) )
  } )

  it( 'are not used as a summary prompt, which falls back to the default', () => {
    const error = vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    expect( resolvePrompt( gradingId() ).profile.id ).toBe( defaultId() )
    expect( error ).toHaveBeenCalled()
  } )
} )
