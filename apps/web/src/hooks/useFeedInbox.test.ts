// Packages
import { focusManager } from '@tanstack/react-query'
// Testing Library
import { act } from '@testing-library/react'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '../api/apiError'
import { listFeedItems } from '../api/feedItems.api'
import { feedItemFixture } from '../test-support/feed.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { INBOX_POLL_MS, useFeedInbox } from './useFeedInbox'

vi.mock( '../api/feedItems.api' )

const mockedList = vi.mocked( listFeedItems )

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedList.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useFeedInbox', () => {
  it( 'starts loading, then returns the items', async () => {
    mockedList.mockResolvedValue( [ feedItemFixture() ] )
    const { result } = renderHookWithClient( () => useFeedInbox() )

    expect( result.current ).toEqual( { items: [], isLoading: true, error: null } )

    await advance( 0 )

    expect( result.current ).toEqual( {
      items: [ feedItemFixture() ],
      isLoading: false,
      error: null,
    } )
  } )

  it( 'reports an error', async () => {
    mockedList.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useFeedInbox() )

    await advance( 0 )

    expect( result.current.error ).toBe( 'Could not reach the server' )
  } )

  it( 'refetches every 60 seconds', async () => {
    expect( INBOX_POLL_MS ).toBe( 60_000 )
    mockedList.mockResolvedValue( [] )
    renderHookWithClient( () => useFeedInbox() )
    await advance( 0 )
    expect( mockedList ).toHaveBeenCalledTimes( 1 )

    await advance( INBOX_POLL_MS - 1 )
    expect( mockedList ).toHaveBeenCalledTimes( 1 )

    await advance( 1 )
    expect( mockedList ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'refetches when the window regains focus, whatever the app default', async () => {
    mockedList.mockResolvedValue( [] )
    renderHookWithClient( () => useFeedInbox() )
    await advance( 0 )
    expect( mockedList ).toHaveBeenCalledTimes( 1 )

    await act( async () => {
      focusManager.setFocused( false )
      focusManager.setFocused( true )
      await vi.advanceTimersByTimeAsync( 0 )
    } )

    expect( mockedList ).toHaveBeenCalledTimes( 2 )
  } )
} )
