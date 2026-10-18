// Packages
import { describe, it, expect } from 'vitest'
// Feeds
import {
  CreateFeedBody,
  DismissFeedItemsBody,
  Feed,
  FeedItem,
  FeedName,
  FeedResponse,
  ListFeedItemsResponse,
  ListFeedsResponse,
  PreviewFeedBody,
  PreviewFeedResponse,
  SummarizeFeedItemsBody,
  SummarizeFeedItemsResponse,
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

const item = {
  id,
  feed_id: otherId,
  feed_name: 'A blog',
  title: 'A post',
  link: 'https://example.com/post',
  published_at: null,
  source_type: 'article',
  added_at: '2026-10-18T10:00:00.000Z',
}

const job = {
  id,
  url: 'https://example.com/post',
  status: 'queued',
  error: null,
  created_at: '2026-10-18T10:00:00.000Z',
  updated_at: '2026-10-18T10:00:00.000Z',
  title: null,
  note_markdown: null,
  target_folder: null,
  expires_at: null,
  saved_path: null,
  summary_model: null,
  prompt_profile_id: null,
  summary_usage: null,
  source_type: 'article',
  feed_id: otherId,
  feed_name: 'A blog',
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

describe( 'FeedItem', () => {
  it( 'accepts an item', () => {
    expect( FeedItem.safeParse( item ).success ).toBe( true )
  } )

  it( 'accepts a video item with a publish date', () => {
    const video = { ...item, source_type: 'video', published_at: '2026-10-17T08:00:00.000Z' }

    expect( FeedItem.safeParse( video ).success ).toBe( true )
  } )

  it.each( Object.keys( item ) )( 'rejects a missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...item }
    delete without[ field ]

    expect( FeedItem.safeParse( without ).success ).toBe( false )
  } )

  it( 'rejects an unknown source_type and a bad link', () => {
    expect( FeedItem.safeParse( { ...item, source_type: 'email' } ).success ).toBe( false )
    expect( FeedItem.safeParse( { ...item, link: 'nope' } ).success ).toBe( false )
  } )

  it( 'ListFeedItemsResponse carries items', () => {
    expect( ListFeedItemsResponse.safeParse( { items: [ item ] } ).success ).toBe( true )
    expect( ListFeedItemsResponse.safeParse( { items: [ { id: 'x' } ] } ).success ).toBe( false )
  } )
} )

describe( 'SummarizeFeedItemsBody', () => {
  const ids = ( count: number ): string[] => {
    return Array.from( { length: count }, () => crypto.randomUUID() )
  }

  it( 'accepts 1 to 50 ids, with an optional model and profile', () => {
    expect( SummarizeFeedItemsBody.safeParse( { ids: ids( 1 ) } ).success ).toBe( true )
    expect( SummarizeFeedItemsBody.safeParse( { ids: ids( 50 ) } ).success ).toBe( true )
    expect( SummarizeFeedItemsBody.safeParse( {
      ids: ids( 2 ),
      model: 'claude-sonnet-5-5',
      profile_id: id,
    } ).success ).toBe( true )
  } )

  it( 'rejects no ids, too many ids, a non-uuid id, an empty model and a bad profile', () => {
    expect( SummarizeFeedItemsBody.safeParse( { ids: [] } ).success ).toBe( false )
    expect( SummarizeFeedItemsBody.safeParse( { ids: ids( 51 ) } ).success ).toBe( false )
    expect( SummarizeFeedItemsBody.safeParse( { ids: [ 'x' ] } ).success ).toBe( false )
    expect( SummarizeFeedItemsBody.safeParse( { ids: ids( 1 ), model: '' } ).success )
      .toBe( false )
    expect( SummarizeFeedItemsBody.safeParse( { ids: ids( 1 ), profile_id: 'x' } ).success )
      .toBe( false )
  } )

  it( 'SummarizeFeedItemsResponse carries jobs', () => {
    expect( SummarizeFeedItemsResponse.safeParse( { jobs: [ job ] } ).success ).toBe( true )
    expect( SummarizeFeedItemsResponse.safeParse( { jobs: [ { id: 'x' } ] } ).success )
      .toBe( false )
  } )
} )

describe( 'DismissFeedItemsBody', () => {
  it( 'accepts 1 to 200 ids', () => {
    const ids = ( count: number ): string[] => {
      return Array.from( { length: count }, () => crypto.randomUUID() )
    }

    expect( DismissFeedItemsBody.safeParse( { ids: ids( 1 ) } ).success ).toBe( true )
    expect( DismissFeedItemsBody.safeParse( { ids: ids( 200 ) } ).success ).toBe( true )
    expect( DismissFeedItemsBody.safeParse( { ids: [] } ).success ).toBe( false )
    expect( DismissFeedItemsBody.safeParse( { ids: ids( 201 ) } ).success ).toBe( false )
    expect( DismissFeedItemsBody.safeParse( { ids: [ 'x' ] } ).success ).toBe( false )
  } )
} )
