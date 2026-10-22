// Packages
import {
  describe,
  it,
  expect,
} from 'vitest'
// Repositories
import {
  findActiveFeedByFeedUrl,
  findFeedById,
  insertFeed as insertFeedRow,
  listDueFeeds,
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

// Check data lives in health_status; the stored feed shows it through a join.
const insertFeed = ( feed: StoredFeed ): void => {
  insertFeedRow( feed )
  seedCheck( 'feed', feed.id, feed.last_checked_at, feed.last_error )
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

    expect( findFeedById( feed.id ) ).toEqual( feed )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findFeedById( crypto.randomUUID() ) ).toBeUndefined()
  } )

  it( 'finds a deleted feed too', () => {
    const feed = buildFeed( { deleted_at: '2026-10-18T12:00:00.000Z' } )
    insertFeed( feed )

    expect( findFeedById( feed.id )?.deleted_at ).toBe( '2026-10-18T12:00:00.000Z' )
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

    expect( listFeeds().map( ( { name } ) => name ) ).toEqual( [ 'Apple', 'banana' ] )
  } )
} )

describe( 'findActiveFeedByFeedUrl', () => {
  it( 'finds the active feed and ignores a deleted one with the same URL', () => {
    const url = 'https://example.com/feed.xml'
    insertFeed( buildFeed( { feed_url: url, deleted_at: '2026-10-18T12:00:00.000Z' } ) )

    expect( findActiveFeedByFeedUrl( url ) ).toBeUndefined()

    const active = buildFeed( { feed_url: url } )
    insertFeed( active )

    expect( findActiveFeedByFeedUrl( url )?.id ).toBe( active.id )
  } )
} )

describe( 'updateFeed', () => {
  it( 'merges changes and returns the updated feed', () => {
    const feed = buildFeed()
    insertFeed( feed )

    const updated = updateFeed( feed.id, { name: 'Renamed', enabled: false } )

    expect( updated ).toEqual( { ...feed, name: 'Renamed', enabled: false } )
    expect( findFeedById( feed.id ) ).toEqual( updated )
  } )

  it( 'can clear the profile', () => {
    const feed = buildFeed( { profile_id: crypto.randomUUID() } )
    insertFeed( feed )

    expect( updateFeed( feed.id, { profile_id: null } )?.profile_id ).toBeNull()
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( updateFeed( crypto.randomUUID(), { name: 'x' } ) ).toBeUndefined()
  } )
} )

describe( 'markFeedDeleted', () => {
  it( 'sets deleted_at, hides the feed from the list and frees its URL', () => {
    const feed = buildFeed()
    insertFeed( feed )

    markFeedDeleted( feed.id, '2026-10-18T12:00:00.000Z' )

    expect( findFeedById( feed.id )?.deleted_at ).toBe( '2026-10-18T12:00:00.000Z' )
    expect( listFeeds() ).toEqual( [] )
    expect( () => insertFeed( buildFeed( { feed_url: feed.feed_url } ) ) ).not.toThrow()
  } )
} )

describe( 'listDueFeeds', () => {
  const now = '2026-10-18T12:00:00.000Z'

  it( 'returns enabled feeds never checked or last checked before now minus the interval', () => {
    const never = buildFeed( { name: 'never' } )
    const old = buildFeed( { name: 'old', last_checked_at: '2026-10-18T10:59:59.000Z' } )
    const edge = buildFeed( { name: 'edge', last_checked_at: '2026-10-18T11:00:00.000Z' } )
    const recent = buildFeed( { name: 'recent', last_checked_at: '2026-10-18T11:30:00.000Z' } )

    for( const feed of [ never, old, edge, recent ] ) {
      insertFeed( feed )
    }

    expect( listDueFeeds( now, 60 ).map( ( { name } ) => name ).sort() )
      .toEqual( [ 'edge', 'never', 'old' ] )
  } )

  it( 'leaves out disabled and deleted feeds', () => {
    insertFeed( buildFeed( { enabled: false } ) )
    insertFeed( buildFeed( { deleted_at: '2026-10-18T12:00:00.000Z' } ) )

    expect( listDueFeeds( now, 60 ) ).toEqual( [] )
  } )

  it( 'honours the interval it is given', () => {
    insertFeed( buildFeed( { last_checked_at: '2026-10-18T11:30:00.000Z' } ) )

    expect( listDueFeeds( now, 60 ) ).toHaveLength( 0 )
    expect( listDueFeeds( now, 15 ) ).toHaveLength( 1 )
  } )

  it( 'returns the least recently checked first', () => {
    insertFeed( buildFeed( { name: 'b', last_checked_at: '2026-10-18T09:00:00.000Z' } ) )
    insertFeed( buildFeed( { name: 'a', last_checked_at: '2026-10-18T08:00:00.000Z' } ) )
    insertFeed( buildFeed( { name: 'never' } ) )

    expect( listDueFeeds( now, 60 ).map( ( { name } ) => name ) ).toEqual( [ 'never', 'a', 'b' ] )
  } )
} )

describe( 'check data from health_status', () => {
  it( 'shows the last check and error of the health row', () => {
    const feed = buildFeed()
    insertFeedRow( feed )
    recordFailure( 'feed', feed.id, '2026-10-19T10:00:00.000Z', 'The site answered 500' )

    expect( findFeedById( feed.id ) ).toMatchObject( {
      last_checked_at: '2026-10-19T10:00:00.000Z',
      last_error: 'The site answered 500',
    } )
    expect( listFeeds()[ 0 ] ).toMatchObject( { last_error: 'The site answered 500' } )
  } )

  it( 'shows nulls for a feed that was never checked', () => {
    const feed = buildFeed()
    insertFeedRow( feed )

    expect( findActiveFeedByFeedUrl( feed.feed_url ) ).toMatchObject( {
      last_checked_at: null,
      last_error: null,
    } )
  } )

  it( 'does not mix up a source and a feed with the same id', () => {
    const feed = buildFeed()
    insertFeedRow( feed )
    recordSuccess( 'gmail_source', feed.id, '2026-10-19T10:00:00.000Z' )

    expect( findFeedById( feed.id )?.last_checked_at ).toBeNull()
  } )

  it( 'does not write the check fields when a feed is inserted or updated', () => {
    const feed = buildFeed( { last_checked_at: '2026-10-19T10:00:00.000Z', last_error: 'x' } )
    insertFeedRow( feed )
    updateFeed( feed.id, { name: 'Renamed', last_error: 'y' } )

    expect( getHealth( 'feed', feed.id ) ).toBeUndefined()
    expect( findFeedById( feed.id ) ).toMatchObject( {
      name: 'Renamed',
      last_checked_at: null,
      last_error: null,
    } )
  } )

  it( 'removes the health row and its errors when a feed is deleted', () => {
    const feed = buildFeed()
    insertFeedRow( feed )
    recordFailure( 'feed', feed.id, '2026-10-19T10:00:00.000Z', 'x' )

    markFeedDeleted( feed.id, '2026-10-20T10:00:00.000Z' )

    expect( getHealth( 'feed', feed.id ) ).toBeUndefined()
    expect( listErrors( 'feed', feed.id ) ).toEqual( [] )
  } )
} )

describe( 'recordFeedFetch', () => {
  it( 'stores the validators and the skipped count and touches nothing else', () => {
    const feed = buildFeed( { name: 'Kept' } )
    insertFeed( feed )

    recordFeedFetch( feed.id, {
      etag: '"v2"',
      last_modified: 'Sun, 19 Oct 2026 10:00:00 GMT',
      last_skipped_count: 3,
    } )

    expect( findFeedById( feed.id ) ).toEqual( {
      ...feed,
      etag: '"v2"',
      last_modified: 'Sun, 19 Oct 2026 10:00:00 GMT',
      last_skipped_count: 3,
    } )
  } )
} )
