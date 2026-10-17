// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
import request from 'supertest'
// Shared
import { GetSettingsResponse } from '@mnemosyne/shared'
// App
import { app } from '../app.js'
// Clients
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Services
import { clearModelCache } from '../services/models.service.js'
import { listProfiles } from '../services/prompts.service.js'
import { LOCKED_INSTRUCTIONS } from '../summarizer/prompts.js'

vi.mock( '../clients/anthropicModels.client.js' )

const listMock = vi.mocked( listSummaryModels )

const profileId = ( name: string ): string => {
  return listProfiles().find( ( profile ) => profile.name === name )?.id ?? ''
}

beforeEach( () => {
  vi.resetAllMocks()
  clearModelCache()
  listMock.mockResolvedValue( [
    { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
  ] )
} )

describe( 'GET /api/settings', () => {
  it( 'returns the defaults and the locked instructions', async () => {
    const response = await request( app ).get( '/api/settings' )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ) ).toEqual( {
      settings: {
        default_model: 'claude-sonnet-5-5',
        default_profile_id: profileId( 'Business ideas' ),
      },
      locked_instructions: LOCKED_INSTRUCTIONS,
    } )
  } )
} )

describe( 'PATCH /api/settings', () => {
  it( 'saves the model and returns the new settings', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_model: 'claude-opus-5-5' } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).settings.default_model )
      .toBe( 'claude-opus-5-5' )
    expect( GetSettingsResponse.parse(
      ( await request( app ).get( '/api/settings' ) ).body,
    ).settings.default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'saves the default profile', async () => {
    const coding = profileId( 'Coding' )

    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_profile_id: coding } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).settings.default_profile_id ).toBe( coding )
  } )

  it.each( [
    [ 'an empty body', {} ],
    [ 'an empty model', { default_model: '' } ],
    [ 'a profile id that is not a uuid', { default_profile_id: 'x' } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const response = await request( app ).patch( '/api/settings' ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 400 for an unknown model', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_model: 'claude-nope' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Unknown model: claude-nope' } )
  } )

  it( 'returns 400 for an unknown profile', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_profile_id: crypto.randomUUID() } )

    expect( response.status ).toBe( 400 )
  } )
} )
