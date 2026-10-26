// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
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
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const addFeed = ( name = 'A blog' ): string => {
  const id = crypto.randomUUID()

  insertFeed( userId, {
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

    expect( insertItemIfNew( userId, item ) ).toBe( true )
    expect( findItemsByIds( userId, [ item.id ] ) ).toEqual( [ item ] )
  } )

  it( 'returns false and keeps the first row when the key was already seen in the feed', () => {
    const feedId = addFeed()
    const first = buildItem( feedId, { item_key: 'same', title: 'First' } )
    const again = buildItem( feedId, { item_key: 'same', title: 'Edited', status: 'baseline' } )

    insertItemIfNew( userId, first )

    expect( insertItemIfNew( userId, again ) ).toBe( false )
    expect( findItemsByIds( userId, [ again.id ] ) ).toEqual( [] )
    expect( findItemsByIds( userId, [ first.id ] )[ 0 ]?.title ).toBe( 'First' )
  } )

  it( 'treats the same key in another feed as new', () => {
    const one = buildItem( addFeed(), { item_key: 'same' } )
    const two = buildItem( addFeed(), { item_key: 'same' } )

    expect( insertItemIfNew( userId, one ) ).toBe( true )
    expect( insertItemIfNew( userId, two ) ).toBe( true )
  } )

  it( 'still sees a dismissed item as seen', () => {
    const feedId = addFeed()
    const item = buildItem( feedId, { item_key: 'same' } )
    insertItemIfNew( userId, item )
    setItemStatus( userId, [ item.id ], 'dismissed' )

    expect( insertItemIfNew( userId, buildItem( feedId, { item_key: 'same' } ) ) ).toBe( false )
  } )
} )

describe( 'listInbox', () => {
  it( 'returns inbox items only, newest first, with the feed name', () => {
    const feedId = addFeed( 'Blog' )
    const older = buildItem( feedId, { title: 'older', added_at: '2026-10-18T10:00:00.000Z' } )
    const newer = buildItem( feedId, { title: 'newer', added_at: '2026-10-18T11:00:00.000Z' } )

    insertItemIfNew( userId, older )
    insertItemIfNew( userId, newer )
    insertItemIfNew( userId, buildItem( feedId, { status: 'baseline' } ) )
    insertItemIfNew( userId, buildItem( feedId, { status: 'dismissed' } ) )
    insertItemIfNew( userId, buildItem( feedId, { status: 'queued' } ) )
    insertItemIfNew( userId, buildItem( feedId, { status: 'skipped' } ) )

    expect( listInbox( userId ).map( ( { title, feed_name } ) => [ title, feed_name ] ) )
      .toEqual( [ [ 'newer', 'Blog' ], [ 'older', 'Blog' ] ] )
  } )

  it( 'keeps the items of a deleted or disabled feed', () => {
    const feedId = addFeed()
    insertItemIfNew( userId, buildItem( feedId ) )

    expect( listInbox( userId ) ).toHaveLength( 1 )
  } )

  it( 'breaks ties on added_at by insertion order, newest first', () => {
    const feedId = addFeed()
    insertItemIfNew( userId, buildItem( feedId, { title: 'first' } ) )
    insertItemIfNew( userId, buildItem( feedId, { title: 'second' } ) )

    expect( listInbox( userId ).map( ( { title } ) => title ) ).toEqual( [ 'second', 'first' ] )
  } )
} )

describe( 'findItemsByIds', () => {
  it( 'returns the items found, in any status, and skips unknown ids', () => {
    const feedId = addFeed()
    const inbox = buildItem( feedId )
    const dismissed = buildItem( feedId, { status: 'dismissed' } )
    insertItemIfNew( userId, inbox )
    insertItemIfNew( userId, dismissed )

    const found = findItemsByIds( userId, [ inbox.id, dismissed.id, crypto.randomUUID() ] )

    expect( found.map( ( { id } ) => id ).sort() ).toEqual( [ inbox.id, dismissed.id ].sort() )
  } )

  it( 'returns nothing for an empty list', () => {
    expect( findItemsByIds( userId, [] ) ).toEqual( [] )
  } )
} )

describe( 'setItemStatus', () => {
  it( 'sets the status and the job id of every item', () => {
    const feedId = addFeed()
    const one = buildItem( feedId )
    const two = buildItem( feedId )
    insertItemIfNew( userId, one )
    insertItemIfNew( userId, two )
    const jobId = crypto.randomUUID()

    setItemStatus( userId, [ one.id ], 'queued', jobId )
    setItemStatus( userId, [ two.id ], 'dismissed' )

    expect( findItemsByIds( userId, [ one.id ] )[ 0 ] )
      .toMatchObject( { status: 'queued', job_id: jobId } )
    expect( findItemsByIds( userId, [ two.id ] )[ 0 ] )
      .toMatchObject( { status: 'dismissed', job_id: null } )
  } )

  it( 'clears the full text when the item leaves the inbox, and only then', () => {
    const feedId = addFeed()
    const leaving = buildItem( feedId, { content_markdown: 'Full text' } )
    const staying = buildItem( feedId, { content_markdown: 'Full text' } )
    insertItemIfNew( userId, leaving )
    insertItemIfNew( userId, staying )

    setItemStatus( userId, [ leaving.id ], 'queued', crypto.randomUUID() )
    setItemStatus( userId, [ staying.id ], 'inbox' )

    expect( findItemsByIds( userId, [ leaving.id ] )[ 0 ]?.content_markdown ).toBeNull()
    expect( findItemsByIds( userId, [ staying.id ] )[ 0 ]?.content_markdown ).toBe( 'Full text' )
  } )

  it( 'does nothing for an empty list', () => {
    expect( () => setItemStatus( userId, [], 'dismissed' ) ).not.toThrow()
  } )
} )

describe( 'countInbox', () => {
  it( 'counts the inbox items of one feed', () => {
    const one = addFeed()
    const two = addFeed()
    insertItemIfNew( userId, buildItem( one ) )
    insertItemIfNew( userId, buildItem( one ) )
    insertItemIfNew( userId, buildItem( one, { status: 'dismissed' } ) )
    insertItemIfNew( userId, buildItem( two ) )

    expect( countInbox( userId, one ) ).toBe( 2 )
    expect( countInbox( userId, two ) ).toBe( 1 )
    expect( countInbox( userId, crypto.randomUUID() ) ).toBe( 0 )
  } )
} )

describe( 'dismissInboxForFeed', () => {
  it( 'dismisses only that feed’s inbox items and clears their text', () => {
    const one = addFeed()
    const two = addFeed()
    const inbox = buildItem( one, { content_markdown: 'Full text' } )
    const queued = buildItem( one, { status: 'queued' } )
    const other = buildItem( two )
    insertItemIfNew( userId, inbox )
    insertItemIfNew( userId, queued )
    insertItemIfNew( userId, other )

    dismissInboxForFeed( userId, one )

    expect( findItemsByIds( userId, [ inbox.id ] )[ 0 ] ).toMatchObject( {
      status: 'dismissed',
      content_markdown: null,
    } )
    expect( findItemsByIds( userId, [ queued.id ] )[ 0 ]?.status ).toBe( 'queued' )
    expect( findItemsByIds( userId, [ other.id ] )[ 0 ]?.status ).toBe( 'inbox' )
  } )
} )

describe( 'ownership', () => {
  const addOtherFeed = ( other: string ): string => {
    const id = crypto.randomUUID()

    insertFeed( other, {
      id,
      url: 'https://example.com',
      feed_url: `https://example.com/${ id }.xml`,
      name: 'Theirs',
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

  it( 'keeps each user\'s inbox, counts and lookups apart', () => {
    const other = createTestUser().id
    const mine = buildItem( addFeed() )
    const theirs = buildItem( addOtherFeed( other ) )

    insertItemIfNew( userId, mine )
    insertItemIfNew( other, theirs )

    expect( listInbox( userId ).map( ( { id } ) => id ) ).toEqual( [ mine.id ] )
    expect( listInbox( other ).map( ( { id } ) => id ) ).toEqual( [ theirs.id ] )
    expect( findItemsByIds( other, [ mine.id ] ) ).toEqual( [] )
    expect( countInbox( other, mine.feed_id ) ).toBe( 0 )
  } )

  it( 'does not change or dismiss another user\'s items', () => {
    const other = createTestUser().id
    const item = buildItem( addFeed() )

    insertItemIfNew( userId, item )
    setItemStatus( other, [ item.id ], 'dismissed' )
    dismissInboxForFeed( other, item.feed_id )

    expect( findItemsByIds( userId, [ item.id ] )[ 0 ]?.status ).toBe( 'inbox' )
    expect( countInbox( userId, item.feed_id ) ).toBe( 1 )
  } )
} )
