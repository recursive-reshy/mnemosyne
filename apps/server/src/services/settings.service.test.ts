// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Errors
import { ValidationError } from '../errors.js'
// Repositories
import { getSetting } from '../repositories/settings.repository.js'
// Summarizer
import { LOCKED_INSTRUCTIONS } from '../summarizer/prompts.js'
// Services
import { assertKnownModel } from './models.service.js'
import { deleteProfile, listProfiles } from './prompts.service.js'
import {
  getLockedInstructions,
  getSettings,
  updateSettings,
} from './settings.service.js'

vi.mock( './models.service.js' )

const assertMock = vi.mocked( assertKnownModel )

const byName = ( name: string ): string => {
  return listProfiles().find( ( profile ) => profile.name === name )?.id ?? ''
}

beforeEach( () => {
  vi.resetAllMocks()
  assertMock.mockResolvedValue( undefined )
} )

describe( 'getSettings', () => {
  it( 'defaults to the shipped model and the Business ideas profile', () => {
    expect( getSettings() ).toEqual( {
      default_model: 'claude-sonnet-5-5',
      default_profile_id: byName( 'Business ideas' ),
    } )
  } )
} )

describe( 'getLockedInstructions', () => {
  it( 'returns the locked instructions', () => {
    expect( getLockedInstructions() ).toBe( LOCKED_INSTRUCTIONS )
  } )
} )

describe( 'updateSettings', () => {
  it( 'saves a known model', async () => {
    const settings = await updateSettings( { default_model: 'claude-opus-5-5' } )

    expect( assertMock ).toHaveBeenCalledWith( 'claude-opus-5-5' )
    expect( settings.default_model ).toBe( 'claude-opus-5-5' )
    expect( getSettings().default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'saves an active profile', async () => {
    const coding = byName( 'Coding' )

    await updateSettings( { default_profile_id: coding } )

    expect( getSettings().default_profile_id ).toBe( coding )
  } )

  it( 'saves both together', async () => {
    const coding = byName( 'Coding' )

    const settings = await updateSettings( {
      default_model: 'claude-opus-5-5',
      default_profile_id: coding,
    } )

    expect( settings ).toEqual( { default_model: 'claude-opus-5-5', default_profile_id: coding } )
  } )

  it( 'rejects an unknown model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings( {
      default_model: 'nope',
      default_profile_id: byName( 'Coding' ),
    } ) ).rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( 'default_model' ) ).toBeUndefined()
    expect( getSettings().default_profile_id ).toBe( byName( 'Business ideas' ) )
  } )

  it( 'rejects an unknown profile', async () => {
    await expect( updateSettings( { default_profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'rejects a deleted profile', async () => {
    const coding = byName( 'Coding' )
    deleteProfile( coding )

    await expect( updateSettings( { default_profile_id: coding } ) )
      .rejects.toThrow( ValidationError )
  } )
} )
