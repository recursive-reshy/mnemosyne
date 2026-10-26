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
import { ValidationError } from '../errors.js'
// Repositories
import { setSetting } from '../repositories/settings.repository.js'
// Clients
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Services
import {
  assertKnownModel,
  clearModelCache,
  listModels,
} from './models.service.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/anthropicModels.client.js' )

const listMock = vi.mocked( listSummaryModels )
const HOUR_MS = 3_600_000

const options = [
  { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
]

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( new Date( '2026-10-17T10:00:00.000Z' ) )
  vi.resetAllMocks()
  clearModelCache()
  listMock.mockResolvedValue( options )
  vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'listModels', () => {
  it( 'returns the API models', async () => {
    expect( await listModels( userId ) ).toEqual( { models: options, source: 'api' } )
  } )

  it( 'caches the list for an hour', async () => {
    await listModels( userId )
    vi.advanceTimersByTime( HOUR_MS - 1 )
    await listModels( userId )

    expect( listMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'fetches again once the hour has passed', async () => {
    await listModels( userId )
    vi.advanceTimersByTime( HOUR_MS + 1 )
    await listModels( userId )

    expect( listMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'falls back to the shipped default model when the API fails', async () => {
    listMock.mockRejectedValue( new Error( 'offline' ) )

    expect( await listModels( userId ) ).toEqual( {
      models: [ { id: 'claude-sonnet-5-5', display_name: 'claude-sonnet-5-5' } ],
      source: 'fallback',
    } )
    expect( logger.error ).toHaveBeenCalled()
  } )

  it( 'falls back to the saved default model when there is one', async () => {
    setSetting( userId, 'default_model', 'claude-opus-5-5' )
    listMock.mockRejectedValue( new Error( 'offline' ) )

    expect( ( await listModels( userId ) ).models ).toEqual( [
      { id: 'claude-opus-5-5', display_name: 'claude-opus-5-5' },
    ] )
  } )

  it( 'does not cache the fallback', async () => {
    listMock.mockRejectedValueOnce( new Error( 'offline' ) )

    expect( ( await listModels( userId ) ).source ).toBe( 'fallback' )
    expect( ( await listModels( userId ) ).source ).toBe( 'api' )
    expect( listMock ).toHaveBeenCalledTimes( 2 )
  } )
} )

describe( 'assertKnownModel', () => {
  it( 'accepts a listed model', async () => {
    await expect( assertKnownModel( userId, 'claude-opus-5-5' ) ).resolves.toBeUndefined()
  } )

  it( 'accepts the current default even when it is not listed', async () => {
    setSetting( userId, 'default_model', 'claude-retired-1' )

    await expect( assertKnownModel( userId, 'claude-retired-1' ) ).resolves.toBeUndefined()
  } )

  it( 'accepts the shipped default when no default is saved', async () => {
    listMock.mockResolvedValue( [] )

    await expect( assertKnownModel( userId, 'claude-sonnet-5-5' ) ).resolves.toBeUndefined()
  } )

  it( 'rejects an unknown model', async () => {
    const result = assertKnownModel( userId, 'claude-nope' )

    await expect( result ).rejects.toThrow( ValidationError )
    await expect( result ).rejects.toThrow( 'Unknown model: claude-nope' )
  } )
} )
