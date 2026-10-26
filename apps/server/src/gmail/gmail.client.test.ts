// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
import type { gmail_v1 } from '@googleapis/gmail'
// Gmail
import { GmailAuthError, withGmail } from './auth.js'
import {
  countMatches,
  getMessage,
  listLabels,
  listMatchingIds,
  listMessageIds,
} from './gmail.client.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( './auth.js', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( './auth.js' ) >(),
  withGmail: vi.fn(),
} ) )

const messagesList = vi.fn()
const messagesGet = vi.fn()
const labelsList = vi.fn()

const fakeClient = {
  users: {
    labels: { list: labelsList },
    messages: { list: messagesList, get: messagesGet },
  },
} as unknown as gmail_v1.Gmail

type ListPage = { data: gmail_v1.Schema$ListMessagesResponse }

const pageOf = ( ids: string[], nextPageToken?: string ): ListPage => {
  return { data: { messages: ids.map( ( id ) => ( { id } ) ), nextPageToken } }
}

const numbered = ( prefix: string, count: number ): string[] => {
  return Array.from( { length: count }, ( _, index ) => `${ prefix }${ index }` )
}

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( withGmail ).mockImplementation( ( _userId, run ) => run( fakeClient ) )
} )

describe( 'listLabels', () => {
  it( 'returns the id, name and type of each label', async () => {
    labelsList.mockResolvedValue( { data: { labels: [
      { id: 'Label_1', name: 'Jobs', type: 'user' },
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'CHAT', name: 'CHAT' },
      { name: 'No id' },
      { id: 'Label_2' },
    ] } } )

    expect( await listLabels( userId ) ).toEqual( [
      { id: 'Label_1', name: 'Jobs', type: 'user' },
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'CHAT', name: 'CHAT', type: 'system' },
    ] )
    expect( labelsList ).toHaveBeenCalledWith( { userId: 'me' } )
  } )

  it( 'returns nothing when Gmail has no labels', async () => {
    labelsList.mockResolvedValue( { data: {} } )

    expect( await listLabels( userId ) ).toEqual( [] )
  } )
} )

describe( 'listMessageIds', () => {
  it( 'lists by label, leaving out spam and trash', async () => {
    messagesList.mockResolvedValue( pageOf( [ 'a', 'b' ] ) )

    expect( await listMessageIds( userId, { labelId: 'Label_1', max: 10 } ) )
      .toEqual( [ 'a', 'b' ] )
    expect( messagesList ).toHaveBeenCalledWith( expect.objectContaining( {
      userId: 'me',
      labelIds: [ 'Label_1' ],
      includeSpamTrash: false,
    } ) )
    expect( messagesList.mock.calls[ 0 ]?.[ 0 ] ).not.toHaveProperty( 'q' )
  } )

  it( 'lists by query as written', async () => {
    messagesList.mockResolvedValue( pageOf( [ 'a' ] ) )

    await listMessageIds( userId, { q: 'from:donotreply@upwork.com', max: 10 } )

    expect( messagesList ).toHaveBeenCalledWith( expect.objectContaining( {
      q: 'from:donotreply@upwork.com',
    } ) )
    expect( messagesList.mock.calls[ 0 ]?.[ 0 ] ).not.toHaveProperty( 'labelIds' )
  } )

  it( 'appends after:<unix seconds> to the query', async () => {
    messagesList.mockResolvedValue( pageOf( [] ) )

    await listMessageIds( userId, {
      q: 'from:a@b.c',
      after: new Date( '2026-10-01T00:00:00.500Z' ),
      max: 10,
    } )

    expect( messagesList ).toHaveBeenCalledWith( expect.objectContaining( {
      q: 'from:a@b.c after:1790812800',
    } ) )
  } )

  it( 'uses after alone when there is no query', async () => {
    messagesList.mockResolvedValue( pageOf( [] ) )

    await listMessageIds( userId, {
      labelId: 'Label_1',
      after: new Date( '2026-10-01T00:00:00Z' ),
      max: 10,
    } )

    expect( messagesList ).toHaveBeenCalledWith( expect.objectContaining( {
      labelIds: [ 'Label_1' ],
      q: 'after:1790812800',
    } ) )
  } )

  it( 'follows page tokens until it has max ids, and trims to max', async () => {
    messagesList
      .mockResolvedValueOnce( pageOf( [ 'a', 'b', 'c' ], 'next-1' ) )
      .mockResolvedValueOnce( pageOf( [ 'd', 'e', 'f' ], 'next-2' ) )

    const ids = await listMessageIds( userId, { labelId: 'L', max: 5 } )

    expect( ids ).toEqual( [ 'a', 'b', 'c', 'd', 'e' ] )
    expect( messagesList ).toHaveBeenCalledTimes( 2 )
    expect( messagesList.mock.calls[ 1 ]?.[ 0 ] ).toEqual( expect.objectContaining( {
      pageToken: 'next-1',
    } ) )
  } )

  it( 'stops at the last page', async () => {
    messagesList.mockResolvedValueOnce( pageOf( [ 'a' ], 'next' ) )
    messagesList.mockResolvedValueOnce( pageOf( [ 'b' ] ) )

    expect( await listMessageIds( userId, { labelId: 'L', max: 50 } ) ).toEqual( [ 'a', 'b' ] )
    expect( messagesList ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'does not ask for more once max is reached', async () => {
    messagesList.mockResolvedValue( pageOf( [ 'a', 'b' ], 'more' ) )

    await listMessageIds( userId, { labelId: 'L', max: 2 } )

    expect( messagesList ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'asks for no more than max in a page', async () => {
    messagesList.mockResolvedValue( pageOf( [] ) )

    await listMessageIds( userId, { labelId: 'L', max: 20 } )

    expect( messagesList ).toHaveBeenCalledWith( expect.objectContaining( { maxResults: 20 } ) )

    await listMessageIds( userId, { labelId: 'L', max: 900 } )

    expect( messagesList ).toHaveBeenLastCalledWith(
      expect.objectContaining( { maxResults: 500 } ),
    )
  } )

  it( 'returns an empty list when nothing matches', async () => {
    messagesList.mockResolvedValue( { data: {} } )

    expect( await listMessageIds( userId, { q: 'nothing', max: 10 } ) ).toEqual( [] )
  } )

  it( 'lets an auth failure through', async () => {
    vi.mocked( withGmail ).mockRejectedValue( new GmailAuthError( 'revoked' ) )

    await expect( listMessageIds( userId, { q: 'x', max: 1 } ) )
      .rejects.toBeInstanceOf( GmailAuthError )
  } )
} )

describe( 'getMessage', () => {
  it( 'fetches the full message by default', async () => {
    messagesGet.mockResolvedValue( { data: { id: 'a', snippet: 'hi' } } )

    expect( await getMessage( userId, 'a' ) ).toEqual( { id: 'a', snippet: 'hi' } )
    expect( messagesGet ).toHaveBeenCalledWith( { userId: 'me', id: 'a', format: 'full' } )
  } )

  it( 'fetches only the headers when asked for metadata', async () => {
    messagesGet.mockResolvedValue( { data: { id: 'a' } } )

    await getMessage( userId, 'a', 'metadata' )

    expect( messagesGet ).toHaveBeenCalledWith( { userId: 'me', id: 'a', format: 'metadata' } )
  } )
} )

describe( 'listMatchingIds', () => {
  const labels = [
    { id: 'Label_1', name: 'One', type: 'user' },
    { id: 'Label_2', name: 'Two', type: 'user' },
  ]

  beforeEach( () => {
    labelsList.mockResolvedValue( { data: { labels } } )
  } )

  it( 'makes one call for a query and checks no labels', async () => {
    messagesList.mockResolvedValue( pageOf( [ 'a', 'b' ] ) )

    const result = await listMatchingIds(
      userId,
      { kind: 'query', query: 'from:a@b.c' },
      { max: 10 },
    )

    expect( result ).toEqual( { ids: [ 'a', 'b' ], heads: [ 'a' ], missingLabelIds: [] } )
    expect( messagesList ).toHaveBeenCalledTimes( 1 )
    expect( labelsList ).not.toHaveBeenCalled()
  } )

  it( 'merges the ids of several labels, each message once', async () => {
    messagesList
      .mockResolvedValueOnce( pageOf( [ 'a', 'b' ] ) )
      .mockResolvedValueOnce( pageOf( [ 'b', 'c' ] ) )

    const result = await listMatchingIds(
      userId,
      { kind: 'labels', label_ids: [ 'Label_1', 'Label_2' ] },
      { max: 10 },
    )

    expect( result.ids ).toEqual( [ 'a', 'b', 'c' ] )
    expect( result.heads ).toEqual( [ 'a', 'b' ] )
    expect( messagesList ).toHaveBeenNthCalledWith( 1, expect.objectContaining( {
      labelIds: [ 'Label_1' ],
    } ) )
    expect( messagesList ).toHaveBeenNthCalledWith( 2, expect.objectContaining( {
      labelIds: [ 'Label_2' ],
    } ) )
  } )

  it( 'passes after through to every call', async () => {
    messagesList.mockResolvedValue( pageOf( [] ) )

    await listMatchingIds(
      userId,
      { kind: 'labels', label_ids: [ 'Label_1', 'Label_2' ] },
      { max: 10, after: new Date( '2026-10-01T00:00:00Z' ) },
    )

    expect( messagesList ).toHaveBeenCalledTimes( 2 )
    messagesList.mock.calls.forEach( ( [ params ] ) => {
      expect( params ).toEqual( expect.objectContaining( { q: 'after:1790812800' } ) )
    } )
  } )

  it( 'skips a label Gmail no longer has, and says which', async () => {
    messagesList.mockResolvedValue( pageOf( [ 'a' ] ) )

    const result = await listMatchingIds(
      userId,
      { kind: 'labels', label_ids: [ 'Label_gone', 'Label_1' ] },
      { max: 10 },
    )

    expect( result ).toEqual( { ids: [ 'a' ], heads: [ 'a' ], missingLabelIds: [ 'Label_gone' ] } )
    expect( messagesList ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'returns nothing when every label is gone', async () => {
    const result = await listMatchingIds(
      userId,
      { kind: 'labels', label_ids: [ 'Label_gone' ] },
      { max: 10 },
    )

    expect( result ).toEqual( { ids: [], heads: [], missingLabelIds: [ 'Label_gone' ] } )
    expect( messagesList ).not.toHaveBeenCalled()
  } )
} )

describe( 'countMatches', () => {
  beforeEach( () => {
    labelsList.mockResolvedValue( {
      data: { labels: [ { id: 'Label_1', name: 'One', type: 'user' } ] },
    } )
  } )

  it( 'counts the matches and returns their ids', async () => {
    messagesList.mockResolvedValue( pageOf( [ 'a', 'b', 'c' ] ) )

    expect( await countMatches( userId, { kind: 'query', query: 'x' } ) ).toEqual( {
      count: 3,
      capped: false,
      ids: [ 'a', 'b', 'c' ],
      heads: [ 'a' ],
      missingLabelIds: [],
    } )
  } )

  it( 'counts up to 500 and says when there are more', async () => {
    messagesList.mockResolvedValue( pageOf( numbered( 'm', 501 ) ) )

    const result = await countMatches( userId, { kind: 'query', query: 'x' } )

    expect( result.count ).toBe( 500 )
    expect( result.capped ).toBe( true )
  } )

  it( 'is not capped at exactly 500', async () => {
    messagesList.mockResolvedValue( pageOf( numbered( 'm', 500 ) ) )

    const result = await countMatches( userId, { kind: 'query', query: 'x' } )

    expect( result.count ).toBe( 500 )
    expect( result.capped ).toBe( false )
  } )

  it( 'reports labels that no longer exist', async () => {
    messagesList.mockResolvedValue( pageOf( [ 'a' ] ) )

    const result = await countMatches(
      userId,
      { kind: 'labels', label_ids: [ 'Label_1', 'Label_gone' ] },
    )

    expect( result.count ).toBe( 1 )
    expect( result.missingLabelIds ).toEqual( [ 'Label_gone' ] )
  } )
} )
