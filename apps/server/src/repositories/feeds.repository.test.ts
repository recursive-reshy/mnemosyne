// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import {
  findActiveFeedByFeedUrl,
  findFeedById,
  insertFeed as insertFeedRow,
  listFeeds,
  markFeedDeleted,
  recordFeedFetch,
  updateFeed,
} from './feeds.repository.js'
import type { StoredFeed } from './feeds.repository.js'
import {
  getHealth,
  listErrors,
  recordFailure,
  recordSuccess,
} from './health.repository.js'
// Test support
import { seedCheck } from '../test-support/health.fixture.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

// Check data lives in health_status; the stored feed shows it through a join.
const insertFeed = ( feed: StoredFeed ): void => {
  insertFeedRow( userId, feed )
  seedCheck( userId, 'feed', feed.id, feed.last_checked_at, feed.last_error )
}

const buildFeed = ( overrides: Partial< StoredFeed > = {} ): StoredFeed => {
  const id = overrides.id ?? crypto.randomUUID()

  return {
    id,
    url: 'https://example.com',
    feed_url: `https://example.com/${ id }.xml`,
    name: 'A blog',
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
    ...overrides,
  }
}

describe( 'insertFeed and findFeedById', () => {
  it( 'returns an equal feed after insert', () => {
    const feed = buildFeed( {
      profile_id: crypto.randomUUID(),
      auto_summarize: true,
      etag: '"abc"',
      last_modified: 'Sat, 18 Oct 2026 10:00:00 GMT',
    } )

    insertFeed( feed )

    expect( findFeedById( userId, feed.id ) ).toEqual( feed )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findFeedById( userId, crypto.randomUUID() ) ).toBeUndefined()
  } )

  it( 'finds a deleted feed too', () => {
    const feed = buildFeed( { deleted_at: '2026-10-18T12:00:00.000Z' } )
    insertFeed( feed )

    expect( findFeedById( userId, feed.id )?.deleted_at ).toBe( '2026-10-18T12:00:00.000Z' )
  } )

  it( 'refuses a second active feed with the same feed_url', () => {
    insertFeed( buildFeed( { feed_url: 'https://example.com/feed.xml' } ) )

    expect( () => insertFeed( buildFeed( { feed_url: 'https://example.com/feed.xml' } ) ) )
      .toThrow()
  } )
} )

describe( 'listFeeds', () => {
  it( 'lists active feeds by name, ignoring case, and leaves out deleted ones', () => {
    insertFeed( buildFeed( { name: 'banana' } ) )
    insertFeed( buildFeed( { name: 'Apple' } ) )
    insertFeed( buildFeed( { name: 'Cherry', deleted_at: '2026-10-18T12:00:00.000Z' } ) )

    expect( listFeeds( userId ).map( ( { name } ) => name ) ).toEqual( [ 'Apple', 'banana' ] )
  } )
} )

describe( 'findActiveFeedByFeedUrl', () => {
  it( 'finds the active feed and ignores a deleted one with the same URL', () => {
    const url = 'https://example.com/feed.xml'
    insertFeed( buildFeed( { feed_url: url, deleted_at: '2026-10-18T12:00:00.000Z' } ) )

    expect( findActiveFeedByFeedUrl( userId, url ) ).toBeUndefined()

    const active = buildFeed( { feed_url: url } )
    insertFeed( active )

    expect( findActiveFeedByFeedUrl( userId, url )?.id ).toBe( active.id )
  } )
} )

describe( 'updateFeed', () => {
  it( 'merges changes and returns the updated feed', () => {
    const feed = buildFeed()
    insertFeed( feed )

    const updated = updateFeed( userId, feed.id, { name: 'Renamed', enabled: false } )

    expect( updated ).toEqual( { ...feed, name: 'Renamed', enabled: false } )
    expect( findFeedById( userId, feed.id ) ).toEqual( updated )
  } )

  it( 'can clear the profile', () => {
    const feed = buildFeed( { profile_id: crypto.randomUUID() } )
    insertFeed( feed )

    expect( updateFeed( userId, feed.id, { profile_id: null } )?.profile_id ).toBeNull()
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( updateFeed( userId, crypto.randomUUID(), { name: 'x' } ) ).toBeUndefined()
  } )
} )

describe( 'markFeedDeleted', () => {
  it( 'sets deleted_at, hides the feed from the list and frees its URL', () => {
    const feed = buildFeed()
    insertFeed( feed )

    markFeedDeleted( userId, feed.id, '2026-10-18T12:00:00.000Z' )

    expect( findFeedById( userId, feed.id )?.deleted_at ).toBe( '2026-10-18T12:00:00.000Z' )
    expect( listFeeds( userId ) ).toEqual( [] )
    expect( () => insertFeed( buildFeed( { feed_url: feed.feed_url } ) ) ).not.toThrow()
  } )
} )

describe( 'check data from health_status', () => {
  it( 'shows the last check and error of the health row', () => {
    const feed = buildFeed()
    insertFeedRow( userId, feed )
    recordFailure( userId, 'feed', feed.id, '2026-10-19T10:00:00.000Z', 'The site answered 500' )

    expect( findFeedById( userId, feed.id ) ).toMatchObject( {
      last_checked_at: '2026-10-19T10:00:00.000Z',
      last_error: 'The site answered 500',
    } )
    expect( listFeeds( userId )[ 0 ] ).toMatchObject( { last_error: 'The site answered 500' } )
  } )

  it( 'shows nulls for a feed that was never checked', () => {
    const feed = buildFeed()
    insertFeedRow( userId, feed )

    expect( findActiveFeedByFeedUrl( userId, feed.feed_url ) ).toMatchObject( {
      last_checked_at: null,
      last_error: null,
    } )
  } )

  it( 'does not mix up a source and a feed with the same id', () => {
    const feed = buildFeed()
    insertFeedRow( userId, feed )
    recordSuccess( userId, 'gmail_source', feed.id, '2026-10-19T10:00:00.000Z' )

    expect( findFeedById( userId, feed.id )?.last_checked_at ).toBeNull()
  } )

  it( 'does not write the check fields when a feed is inserted or updated', () => {
    const feed = buildFeed( { last_checked_at: '2026-10-19T10:00:00.000Z', last_error: 'x' } )
    insertFeedRow( userId, feed )
    updateFeed( userId, feed.id, { name: 'Renamed', last_error: 'y' } )

    expect( getHealth( userId, 'feed', feed.id ) ).toBeUndefined()
    expect( findFeedById( userId, feed.id ) ).toMatchObject( {
      name: 'Renamed',
      last_checked_at: null,
      last_error: null,
    } )
  } )

  it( 'removes the health row and its errors when a feed is deleted', () => {
    const feed = buildFeed()
    insertFeedRow( userId, feed )
    recordFailure( userId, 'feed', feed.id, '2026-10-19T10:00:00.000Z', 'x' )

    markFeedDeleted( userId, feed.id, '2026-10-20T10:00:00.000Z' )

    expect( getHealth( userId, 'feed', feed.id ) ).toBeUndefined()
    expect( listErrors( userId, 'feed', feed.id ) ).toEqual( [] )
  } )
} )

describe( 'recordFeedFetch', () => {
  it( 'stores the validators and the skipped count and touches nothing else', () => {
    const feed = buildFeed( { name: 'Kept' } )
    insertFeed( feed )

    recordFeedFetch( userId, feed.id, {
      etag: '"v2"',
      last_modified: 'Sun, 19 Oct 2026 10:00:00 GMT',
      last_skipped_count: 3,
    } )

    expect( findFeedById( userId, feed.id ) ).toEqual( {
      ...feed,
      etag: '"v2"',
      last_modified: 'Sun, 19 Oct 2026 10:00:00 GMT',
      last_skipped_count: 3,
    } )
  } )
} )

describe( 'ownership', () => {
  it( 'does not show, change or delete another user\'s feed', () => {
    const other = createTestUser().id
    const feed = buildFeed()

    insertFeed( feed )

    expect( findFeedById( other, feed.id ) ).toBeUndefined()
    expect( findActiveFeedByFeedUrl( other, feed.feed_url ) ).toBeUndefined()
    expect( listFeeds( other ) ).toEqual( [] )
    expect( updateFeed( other, feed.id, { name: 'Stolen' } ) ).toBeUndefined()

    markFeedDeleted( other, feed.id, '2026-10-19T00:00:00.000Z' )
    recordFeedFetch( other, feed.id, { etag: 'x', last_modified: 'y', last_skipped_count: 9 } )

    expect( findFeedById( userId, feed.id ) ).toEqual( feed )
  } )

  it( 'lets two users follow the same feed address', () => {
    const other = createTestUser().id
    const feed = buildFeed()

    insertFeed( feed )

    expect( () => insertFeedRow( other, buildFeed( { feed_url: feed.feed_url } ) ) ).not.toThrow()
    expect( () => insertFeedRow( userId, buildFeed( { feed_url: feed.feed_url } ) ) )
      .toThrow( /UNIQUE/ )
    expect( listFeeds( other ) ).toHaveLength( 1 )
  } )
} )
