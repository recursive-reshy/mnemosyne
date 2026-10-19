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
import { summarizeFeedItems } from '../api/feedItems.api'
import { ITEM_ID } from '../test-support/feed.fixture'
import { jobFixture } from '../test-support/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { feedKeys, jobKeys } from './queryKeys'
import { useSummarizeFeedItems } from './useSummarizeFeedItems'

vi.mock( '../api/feedItems.api' )

const mockedSummarize = vi.mocked( summarizeFeedItems )
const ref = { kind: 'feed' as const, id: ITEM_ID }

beforeEach( () => {
  mockedSummarize.mockReset()
} )

describe( 'useSummarizeFeedItems', () => {
  it( 'sends the choices, then refreshes the jobs, the inbox and the feeds', async () => {
    mockedSummarize.mockResolvedValue( [ jobFixture() ] )
    const { result, queryClient } = renderHookWithClient( () => useSummarizeFeedItems() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )
    const body = { items: [ ref ], profile_id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b' }

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedSummarize ).toHaveBeenCalledWith( body )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: jobKeys.all, exact: true } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.inbox } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
  } )

  it( 'reports the server\'s message and refreshes nothing', async () => {
    mockedSummarize.mockRejectedValue( new ApiError( 'Not in the inbox: abc', 409 ) )
    const { result, queryClient } = renderHookWithClient( () => useSummarizeFeedItems() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( { items: [ ref ] } ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Not in the inbox: abc' )
    expect( invalidate ).not.toHaveBeenCalled()
  } )
} )
