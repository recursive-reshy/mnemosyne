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
import { feedItemFixture, ITEM_ID } from '../test-support/feed.fixture'
import { jobFixture } from '../test-support/job.fixture'
import { dismissFeedItems, listFeedItems, summarizeFeedItems } from './feedItems.api'

const fetchMock = vi.fn()

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const jsonInit = ( body: unknown ): RequestInit => {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'listFeedItems', () => {
  it( 'gets the inbox', async () => {
    fetchMock.mockResolvedValue( json( { items: [ feedItemFixture() ] } ) )

    await expect( listFeedItems() ).resolves.toEqual( [ feedItemFixture() ] )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/feed-items', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( json( { items: [ { id: 'x' } ] } ) )

    await expect( listFeedItems() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )

describe( 'summarizeFeedItems', () => {
  it( 'posts the ids and choices and returns the jobs', async () => {
    const jobs = [ jobFixture() ]
    fetchMock.mockResolvedValue( json( { jobs } ) )
    const body = { ids: [ ITEM_ID ], model: 'claude-sonnet-5-5' }

    await expect( summarizeFeedItems( body ) ).resolves.toEqual( jobs )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/feed-items/summarize', jsonInit( body ) )
  } )

  it( 'throws the server\'s message on a conflict', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Not in the inbox: abc' }, 409 ) )

    await expect( summarizeFeedItems( { ids: [ ITEM_ID ] } ) ).rejects.toThrow(
      'Not in the inbox: abc',
    )
  } )
} )

describe( 'dismissFeedItems', () => {
  it( 'posts the ids', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( dismissFeedItems( [ ITEM_ID ] ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/feed-items/dismiss',
      jsonInit( { ids: [ ITEM_ID ] } ),
    )
  } )
} )
