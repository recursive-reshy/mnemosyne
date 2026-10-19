// Packages
import { describe, it, expect } from 'vitest'
// Feeds
import {
  CreateFeedBody,
  Feed,
  FeedName,
  FeedResponse,
  ListFeedsResponse,
  PreviewFeedBody,
  PreviewFeedResponse,
  UpdateFeedBody,
} from './feeds.js'

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const otherId = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const feed = {
  id,
  url: 'https://example.com',
  feed_url: 'https://example.com/feed.xml',
  name: 'A blog',
  profile_id: null,
  enabled: true,
  auto_summarize: false,
  last_checked_at: null,
  last_error: null,
  last_skipped_count: 0,
  inbox_count: 0,
  created_at: '2026-10-18T10:00:00.000Z',
}

describe( 'FeedName', () => {
  it( 'trims and accepts 1 to 100 characters', () => {
    expect( FeedName.parse( '  A blog  ' ) ).toBe( 'A blog' )
    expect( FeedName.safeParse( 'x'.repeat( 100 ) ).success ).toBe( true )
  } )

  it( 'rejects empty, blank and over-long names', () => {
    expect( FeedName.safeParse( '' ).success ).toBe( false )
    expect( FeedName.safeParse( '   ' ).success ).toBe( false )
    expect( FeedName.safeParse( 'x'.repeat( 101 ) ).success ).toBe( false )
  } )
} )

describe( 'Feed', () => {
  it( 'accepts a feed', () => {
    expect( Feed.safeParse( feed ).success ).toBe( true )
  } )

  it( 'accepts a profile, a check time, an error and counts', () => {
    const used = {
      ...feed,
      profile_id: otherId,
      last_checked_at: '2026-10-18T11:00:00.000Z',
      last_error: 'The site answered 500',
      last_skipped_count: 4,
      inbox_count: 7,
    }

    expect( Feed.safeParse( used ).success ).toBe( true )
  } )

  it.each( Object.keys( feed ) )( 'rejects a missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...feed }
    delete without[ field ]

    expect( Feed.safeParse( without ).success ).toBe( false )
  } )

  it( 'rejects bad values', () => {
    expect( Feed.safeParse( { ...feed, id: 'x' } ).success ).toBe( false )
    expect( Feed.safeParse( { ...feed, feed_url: 'nope' } ).success ).toBe( false )
    expect( Feed.safeParse( { ...feed, profile_id: 'x' } ).success ).toBe( false )
    expect( Feed.safeParse( { ...feed, last_checked_at: 'yesterday' } ).success ).toBe( false )
    expect( Feed.safeParse( { ...feed, inbox_count: 1.5 } ).success ).toBe( false )
  } )
} )

describe( 'PreviewFeedBody and PreviewFeedResponse', () => {
  it( 'takes an http or https URL', () => {
    expect( PreviewFeedBody.safeParse( { url: 'https://example.com' } ).success ).toBe( true )
    expect( PreviewFeedBody.safeParse( { url: 'ftp://example.com' } ).success ).toBe( false )
    expect( PreviewFeedBody.safeParse( {} ).success ).toBe( false )
  } )

  it( 'returns the feed URL, its title and the latest item or null', () => {
    const response = { feed_url: 'https://example.com/feed.xml', title: 'A blog' }

    expect( PreviewFeedResponse.safeParse( { ...response, latest_item: null } ).success )
      .toBe( true )
    expect( PreviewFeedResponse.safeParse( {
      ...response,
      latest_item: { title: 'A post', published_at: '2026-10-18T10:00:00.000Z' },
    } ).success ).toBe( true )
    expect( PreviewFeedResponse.safeParse( {
      ...response,
      latest_item: { title: 'A post', published_at: null },
    } ).success ).toBe( true )
    expect( PreviewFeedResponse.safeParse( response ).success ).toBe( false )
  } )
} )

describe( 'CreateFeedBody', () => {
  it( 'needs only a URL', () => {
    expect( CreateFeedBody.safeParse( { url: 'https://example.com' } ).success ).toBe( true )
  } )

  it( 'accepts a name, a profile and auto_summarize', () => {
    const body = { url: 'https://example.com', name: 'Mine', profile_id: id, auto_summarize: true }

    expect( CreateFeedBody.safeParse( body ).success ).toBe( true )
  } )

  it( 'rejects a blank name, a non-uuid profile and a non-http URL', () => {
    const url = 'https://example.com'

    expect( CreateFeedBody.safeParse( { url, name: ' ' } ).success ).toBe( false )
    expect( CreateFeedBody.safeParse( { url, profile_id: 'x' } ).success ).toBe( false )
    expect( CreateFeedBody.safeParse( { url: 'file:///etc/passwd' } ).success ).toBe( false )
  } )
} )

describe( 'UpdateFeedBody', () => {
  it.each( [
    { name: 'New' },
    { profile_id: id },
    { profile_id: null },
    { enabled: false },
    { auto_summarize: true },
  ] )( 'accepts %o', ( body ) => {
    expect( UpdateFeedBody.safeParse( body ).success ).toBe( true )
  } )

  it( 'rejects an empty body', () => {
    expect( UpdateFeedBody.safeParse( {} ).success ).toBe( false )
  } )

  it( 'rejects a body of undefined values and bad values', () => {
    expect( UpdateFeedBody.safeParse( { name: undefined } ).success ).toBe( false )
    expect( UpdateFeedBody.safeParse( { name: '' } ).success ).toBe( false )
    expect( UpdateFeedBody.safeParse( { profile_id: 'x' } ).success ).toBe( false )
  } )
} )

describe( 'feed responses', () => {
  it( 'ListFeedsResponse and FeedResponse carry feeds', () => {
    expect( ListFeedsResponse.safeParse( { feeds: [ feed ] } ).success ).toBe( true )
    expect( ListFeedsResponse.safeParse( {} ).success ).toBe( false )
    expect( FeedResponse.safeParse( { feed } ).success ).toBe( true )
    expect( FeedResponse.safeParse( { feed: { ...feed, id: 'x' } } ).success ).toBe( false )
  } )
} )
