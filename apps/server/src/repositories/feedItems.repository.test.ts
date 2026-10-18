// Packages
import {
  describe,
  it,
  expect,
} from 'vitest'
// Repositories
import { insertFeed } from './feeds.repository.js'
import {
  countInbox,
  dismissInboxForFeed,
  findItemsByIds,
  insertItemIfNew,
  listInbox,
  setItemStatus,
} from './feedItems.repository.js'
import type { StoredFeedItem } from './feedItems.repository.js'

const addFeed = ( name = 'A blog' ): string => {
  const id = crypto.randomUUID()

  insertFeed( {
    id,
    url: 'https://example.com',
    feed_url: `https://example.com/${ id }.xml`,
    name,
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    etag: null,
    last_modified: null,
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: '2026-10-18T10:00:00.000Z',
    deleted_at: null,
  } )

  return id
}

const buildItem = ( feedId: string, overrides: Partial< StoredFeedItem > = {} ): StoredFeedItem => {
  const id = overrides.id ?? crypto.randomUUID()

  return {
    id,
    feed_id: feedId,
    item_key: `key-${ id }`,
    title: 'A post',
    link: 'https://example.com/post',
    published_at: null,
    author: null,
    content_markdown: null,
    status: 'inbox',
    job_id: null,
    added_at: '2026-10-18T10:00:00.000Z',
    ...overrides,
  }
}

describe( 'insertItemIfNew', () => {
  it( 'returns true for a new item and stores it', () => {
    const feedId = addFeed()
    const item = buildItem( feedId, { content_markdown: 'Full text', author: 'Ada' } )

    expect( insertItemIfNew( item ) ).toBe( true )
    expect( findItemsByIds( [ item.id ] ) ).toEqual( [ item ] )
  } )

  it( 'returns false and keeps the first row when the key was already seen in the feed', () => {
    const feedId = addFeed()
    const first = buildItem( feedId, { item_key: 'same', title: 'First' } )
    const again = buildItem( feedId, { item_key: 'same', title: 'Edited', status: 'baseline' } )

    insertItemIfNew( first )

    expect( insertItemIfNew( again ) ).toBe( false )
    expect( findItemsByIds( [ again.id ] ) ).toEqual( [] )
    expect( findItemsByIds( [ first.id ] )[ 0 ]?.title ).toBe( 'First' )
  } )

  it( 'treats the same key in another feed as new', () => {
    const one = buildItem( addFeed(), { item_key: 'same' } )
    const two = buildItem( addFeed(), { item_key: 'same' } )

    expect( insertItemIfNew( one ) ).toBe( true )
    expect( insertItemIfNew( two ) ).toBe( true )
  } )

  it( 'still sees a dismissed item as seen', () => {
    const feedId = addFeed()
    const item = buildItem( feedId, { item_key: 'same' } )
    insertItemIfNew( item )
    setItemStatus( [ item.id ], 'dismissed' )

    expect( insertItemIfNew( buildItem( feedId, { item_key: 'same' } ) ) ).toBe( false )
  } )
} )

describe( 'listInbox', () => {
  it( 'returns inbox items only, newest first, with the feed name', () => {
    const feedId = addFeed( 'Blog' )
    const older = buildItem( feedId, { title: 'older', added_at: '2026-10-18T10:00:00.000Z' } )
    const newer = buildItem( feedId, { title: 'newer', added_at: '2026-10-18T11:00:00.000Z' } )

    insertItemIfNew( older )
    insertItemIfNew( newer )
    insertItemIfNew( buildItem( feedId, { status: 'baseline' } ) )
    insertItemIfNew( buildItem( feedId, { status: 'dismissed' } ) )
    insertItemIfNew( buildItem( feedId, { status: 'queued' } ) )
    insertItemIfNew( buildItem( feedId, { status: 'skipped' } ) )

    expect( listInbox().map( ( { title, feed_name } ) => [ title, feed_name ] ) )
      .toEqual( [ [ 'newer', 'Blog' ], [ 'older', 'Blog' ] ] )
  } )

  it( 'keeps the items of a deleted or disabled feed', () => {
    const feedId = addFeed()
    insertItemIfNew( buildItem( feedId ) )

    expect( listInbox() ).toHaveLength( 1 )
  } )

  it( 'breaks ties on added_at by insertion order, newest first', () => {
    const feedId = addFeed()
    insertItemIfNew( buildItem( feedId, { title: 'first' } ) )
    insertItemIfNew( buildItem( feedId, { title: 'second' } ) )

    expect( listInbox().map( ( { title } ) => title ) ).toEqual( [ 'second', 'first' ] )
  } )
} )

describe( 'findItemsByIds', () => {
  it( 'returns the items found, in any status, and skips unknown ids', () => {
    const feedId = addFeed()
    const inbox = buildItem( feedId )
    const dismissed = buildItem( feedId, { status: 'dismissed' } )
    insertItemIfNew( inbox )
    insertItemIfNew( dismissed )

    const found = findItemsByIds( [ inbox.id, dismissed.id, crypto.randomUUID() ] )

    expect( found.map( ( { id } ) => id ).sort() ).toEqual( [ inbox.id, dismissed.id ].sort() )
  } )

  it( 'returns nothing for an empty list', () => {
    expect( findItemsByIds( [] ) ).toEqual( [] )
  } )
} )

describe( 'setItemStatus', () => {
  it( 'sets the status and the job id of every item', () => {
    const feedId = addFeed()
    const one = buildItem( feedId )
    const two = buildItem( feedId )
    insertItemIfNew( one )
    insertItemIfNew( two )
    const jobId = crypto.randomUUID()

    setItemStatus( [ one.id ], 'queued', jobId )
    setItemStatus( [ two.id ], 'dismissed' )

    expect( findItemsByIds( [ one.id ] )[ 0 ] ).toMatchObject( { status: 'queued', job_id: jobId } )
    expect( findItemsByIds( [ two.id ] )[ 0 ] )
      .toMatchObject( { status: 'dismissed', job_id: null } )
  } )

  it( 'clears the full text when the item leaves the inbox, and only then', () => {
    const feedId = addFeed()
    const leaving = buildItem( feedId, { content_markdown: 'Full text' } )
    const staying = buildItem( feedId, { content_markdown: 'Full text' } )
    insertItemIfNew( leaving )
    insertItemIfNew( staying )

    setItemStatus( [ leaving.id ], 'queued', crypto.randomUUID() )
    setItemStatus( [ staying.id ], 'inbox' )

    expect( findItemsByIds( [ leaving.id ] )[ 0 ]?.content_markdown ).toBeNull()
    expect( findItemsByIds( [ staying.id ] )[ 0 ]?.content_markdown ).toBe( 'Full text' )
  } )

  it( 'does nothing for an empty list', () => {
    expect( () => setItemStatus( [], 'dismissed' ) ).not.toThrow()
  } )
} )

describe( 'countInbox', () => {
  it( 'counts the inbox items of one feed', () => {
    const one = addFeed()
    const two = addFeed()
    insertItemIfNew( buildItem( one ) )
    insertItemIfNew( buildItem( one ) )
    insertItemIfNew( buildItem( one, { status: 'dismissed' } ) )
    insertItemIfNew( buildItem( two ) )

    expect( countInbox( one ) ).toBe( 2 )
    expect( countInbox( two ) ).toBe( 1 )
    expect( countInbox( crypto.randomUUID() ) ).toBe( 0 )
  } )
} )

describe( 'dismissInboxForFeed', () => {
  it( 'dismisses only that feed’s inbox items and clears their text', () => {
    const one = addFeed()
    const two = addFeed()
    const inbox = buildItem( one, { content_markdown: 'Full text' } )
    const queued = buildItem( one, { status: 'queued' } )
    const other = buildItem( two )
    insertItemIfNew( inbox )
    insertItemIfNew( queued )
    insertItemIfNew( other )

    dismissInboxForFeed( one )

    expect( findItemsByIds( [ inbox.id ] )[ 0 ] ).toMatchObject( {
      status: 'dismissed',
      content_markdown: null,
    } )
    expect( findItemsByIds( [ queued.id ] )[ 0 ]?.status ).toBe( 'queued' )
    expect( findItemsByIds( [ other.id ] )[ 0 ]?.status ).toBe( 'inbox' )
  } )
} )
