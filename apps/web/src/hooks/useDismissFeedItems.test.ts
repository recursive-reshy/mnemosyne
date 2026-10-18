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
import { dismissFeedItems } from '../api/feedItems.api'
import { ITEM_ID } from '../test-support/feed.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { feedKeys } from './queryKeys'
import { useDismissFeedItems } from './useDismissFeedItems'

vi.mock( '../api/feedItems.api' )

const mockedDismiss = vi.mocked( dismissFeedItems )

beforeEach( () => {
  mockedDismiss.mockReset()
} )

describe( 'useDismissFeedItems', () => {
  it( 'dismisses the ids, then refreshes the inbox and the feeds', async () => {
    mockedDismiss.mockResolvedValue( undefined )
    const { result, queryClient } = renderHookWithClient( () => useDismissFeedItems() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( [ ITEM_ID ] ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedDismiss ).toHaveBeenCalledWith( [ ITEM_ID ] )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.inbox } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
  } )

  it( 'reports an error', async () => {
    mockedDismiss.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useDismissFeedItems() )

    act( () => result.current.mutate( [ ITEM_ID ] ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Could not reach the server' )
  } )
} )
