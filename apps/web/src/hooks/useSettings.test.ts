// Testing Library
import { act } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '../api/apiError'
import { getSettings, updateSettings } from '../api/settings.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { settingsFixture } from '../test-support/summarizer.fixture'
import { settingsKeys } from './queryKeys'
import { useSettings } from './useSettings'

vi.mock( '../api/settings.api' )

const mockedGet = vi.mocked( getSettings )
const mockedUpdate = vi.mocked( updateSettings )

beforeEach( () => {
  mockedGet.mockReset()
  mockedUpdate.mockReset()
} )

describe( 'useSettings', () => {
  it( 'starts loading, then returns the settings and the locked instructions', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    const { result } = renderHookWithClient( () => useSettings() )

    expect( result.current ).toMatchObject( {
      settings: null,
      lockedInstructions: null,
      isLoading: true,
      error: null,
    } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current ).toMatchObject( {
      settings: settingsFixture().settings,
      lockedInstructions: settingsFixture().locked_instructions.video,
      error: null,
    } )
  } )

  it( 'reports a load error', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useSettings() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
    expect( result.current.settings ).toBeNull()
  } )

  it( 'saves a change and puts the response in the cache', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    const updated = settingsFixture( { default_model: 'claude-opus-5-5' } )
    mockedUpdate.mockResolvedValue( updated )
    const { result, queryClient } = renderHookWithClient( () => useSettings() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    act( () => result.current.updateSettings.mutate( { default_model: 'claude-opus-5-5' } ) )

    await vi.waitFor( () => expect( result.current.updateSettings.isSuccess ).toBe( true ) )
    expect( mockedUpdate ).toHaveBeenCalledWith( { default_model: 'claude-opus-5-5' } )
    expect( queryClient.getQueryData( settingsKeys.all ) ).toEqual( updated )
    expect( result.current.settings?.default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'keeps the old settings and reports a failed save', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    mockedUpdate.mockRejectedValue( new ApiError( 'Unknown model: x', 400 ) )
    const { result, queryClient } = renderHookWithClient( () => useSettings() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    act( () => result.current.updateSettings.mutate( { default_model: 'x' } ) )

    await vi.waitFor( () => expect( result.current.updateSettings.isError ).toBe( true ) )
    expect( result.current.updateSettings.error?.message ).toBe( 'Unknown model: x' )
    expect( queryClient.getQueryData( settingsKeys.all ) ).toEqual( settingsFixture() )
  } )
} )
