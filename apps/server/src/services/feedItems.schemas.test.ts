// Packages
import { describe, it, expect } from 'vitest'
// Feed items
import {
  DismissFeedItemsBody,
  FeedItem,
  ListFeedItemsResponse,
  SummarizeFeedItemsBody,
  SummarizeFeedItemsResponse,
} from './feedItems.schemas.js'

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const otherId = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

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
  gmail_source_id: null,
  gmail_source_name: null,
}

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
