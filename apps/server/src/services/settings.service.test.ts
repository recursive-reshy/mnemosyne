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
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Summarizer
import { LOCKED_INSTRUCTIONS_ARTICLE, LOCKED_INSTRUCTIONS_VIDEO } from '../summarizer/prompts.js'
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
      extraction_model: 'claude-sonnet-5-5',
      default_profile_id: byName( 'Business ideas' ),
      feed_check_interval_minutes: 60,
    } )
  } )

  it( 'reads the extraction model from the stored setting when there is one', () => {
    setSetting( 'extraction_model', 'claude-haiku-5-5' )

    expect( getSettings().extraction_model ).toBe( 'claude-haiku-5-5' )
  } )

  it( 'reads the feed check interval from the stored setting when there is one', () => {
    setSetting( 'feed_check_interval_minutes', 180 )

    expect( getSettings().feed_check_interval_minutes ).toBe( 180 )
  } )
} )

describe( 'getLockedInstructions', () => {
  it( 'returns the locked instructions for videos and articles', () => {
    expect( getLockedInstructions() ).toEqual( {
      video: LOCKED_INSTRUCTIONS_VIDEO,
      article: LOCKED_INSTRUCTIONS_ARTICLE,
    } )
  } )
} )

describe( 'updateSettings', () => {
  it( 'saves a known model', async () => {
    const settings = await updateSettings( { default_model: 'claude-opus-5-5' } )

    expect( assertMock ).toHaveBeenCalledWith( 'claude-opus-5-5' )
    expect( settings.default_model ).toBe( 'claude-opus-5-5' )
    expect( getSettings().default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'saves a known extraction model', async () => {
    const settings = await updateSettings( { extraction_model: 'claude-haiku-5-5' } )

    expect( assertMock ).toHaveBeenCalledWith( 'claude-haiku-5-5' )
    expect( settings.extraction_model ).toBe( 'claude-haiku-5-5' )
    expect( getSetting( 'extraction_model' ) ).toBe( 'claude-haiku-5-5' )
    expect( settings.default_model ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'rejects an unknown extraction model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings( { extraction_model: 'nope' } ) )
      .rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( 'extraction_model' ) ).toBeUndefined()
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

    expect( settings ).toEqual( {
      default_model: 'claude-opus-5-5',
      extraction_model: 'claude-sonnet-5-5',
      default_profile_id: coding,
      feed_check_interval_minutes: 60,
    } )
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
