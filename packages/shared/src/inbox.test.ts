// Packages
import { describe, it, expect } from 'vitest'
// Inbox
import {
  DismissInboxBody,
  InboxItem,
  InboxItemRef,
  ListInboxResponse,
  SummarizeInboxBody,
  SummarizeInboxResponse,
} from './inbox.js'

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const otherId = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const feedItem = {
  kind: 'feed',
  id,
  feed_id: otherId,
  feed_name: 'A blog',
  title: 'A post',
  link: 'https://example.com/post',
  published_at: null,
  source_type: 'article',
  added_at: '2026-10-18T10:00:00.000Z',
}

const gmailItem = {
  kind: 'gmail',
  id,
  source_id: otherId,
  source_name: 'Lenny',
  title: 'A newsletter',
  sender: 'Lenny Rachitsky',
  link: 'https://mail.google.com/mail/u/naresh%40example.com/#all/18c2',
  published_at: '2026-10-17T08:00:00.000Z',
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
  link_state: null,
  link_error: null,
  link_usage: null,
  source_type: 'article',
  feed_id: null,
  feed_name: null,
  gmail_source_id: null,
  gmail_source_name: null,
}

const refs = ( count: number ): { kind: 'feed', id: string }[] => {
  return Array.from( { length: count }, () => ( { kind: 'feed', id: crypto.randomUUID() } ) )
}

describe( 'InboxItemRef', () => {
  it( 'accepts a feed and a gmail reference', () => {
    expect( InboxItemRef.safeParse( { kind: 'feed', id } ).success ).toBe( true )
    expect( InboxItemRef.safeParse( { kind: 'gmail', id } ).success ).toBe( true )
  } )

  it( 'rejects an unknown kind and a non-uuid id', () => {
    expect( InboxItemRef.safeParse( { kind: 'rss', id } ).success ).toBe( false )
    expect( InboxItemRef.safeParse( { kind: 'feed', id: 'x' } ).success ).toBe( false )
  } )
} )

describe( 'InboxItem', () => {
  it( 'accepts a feed item, with a video type and a publish date', () => {
    expect( InboxItem.safeParse( feedItem ).success ).toBe( true )
    expect( InboxItem.safeParse(
      { ...feedItem, source_type: 'video', published_at: '2026-10-17T08:00:00.000Z' },
    ).success ).toBe( true )
  } )

  it( 'accepts a gmail item', () => {
    expect( InboxItem.safeParse( gmailItem ).success ).toBe( true )
  } )

  it.each( Object.keys( feedItem ) )( 'rejects a feed item missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...feedItem }
    delete without[ field ]

    expect( InboxItem.safeParse( without ).success ).toBe( false )
  } )

  it.each( Object.keys( gmailItem ) )( 'rejects a gmail item missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...gmailItem }
    delete without[ field ]

    expect( InboxItem.safeParse( without ).success ).toBe( false )
  } )

  it( 'needs a publish date on a gmail item and allows a feed item without one', () => {
    expect( InboxItem.safeParse( { ...gmailItem, published_at: null } ).success ).toBe( false )
    expect( InboxItem.safeParse( { ...feedItem, published_at: null } ).success ).toBe( true )
  } )

  it( 'limits a gmail item to articles', () => {
    expect( InboxItem.safeParse( { ...gmailItem, source_type: 'video' } ).success )
      .toBe( false )
  } )

  it( 'does not mix the two shapes', () => {
    expect( InboxItem.safeParse( { ...feedItem, kind: 'gmail' } ).success ).toBe( false )
    expect( InboxItem.safeParse( { ...gmailItem, kind: 'feed' } ).success ).toBe( false )
  } )

  it( 'rejects an unknown kind and a bad link', () => {
    expect( InboxItem.safeParse( { ...feedItem, kind: 'rss' } ).success ).toBe( false )
    expect( InboxItem.safeParse( { ...gmailItem, link: 'nope' } ).success ).toBe( false )
  } )

  it( 'ListInboxResponse carries items of both kinds', () => {
    expect( ListInboxResponse.safeParse( { items: [ feedItem, gmailItem ] } ).success )
      .toBe( true )
    expect( ListInboxResponse.safeParse( { items: [ { id: 'x' } ] } ).success ).toBe( false )
  } )
} )

describe( 'SummarizeInboxBody', () => {
  it( 'accepts 1 to 50 refs, with an optional model and profile', () => {
    expect( SummarizeInboxBody.safeParse( { items: refs( 1 ) } ).success ).toBe( true )
    expect( SummarizeInboxBody.safeParse( { items: refs( 50 ) } ).success ).toBe( true )
    expect( SummarizeInboxBody.safeParse( {
      items: [ { kind: 'gmail', id } ],
      model: 'claude-sonnet-5-5',
      profile_id: id,
    } ).success ).toBe( true )
  } )

  it( 'rejects no refs, too many refs, a bad ref, an empty model and a bad profile', () => {
    expect( SummarizeInboxBody.safeParse( { items: [] } ).success ).toBe( false )
    expect( SummarizeInboxBody.safeParse( { items: refs( 51 ) } ).success ).toBe( false )
    expect( SummarizeInboxBody.safeParse( { items: [ { kind: 'feed', id: 'x' } ] } ).success )
      .toBe( false )
    expect( SummarizeInboxBody.safeParse( { items: refs( 1 ), model: '' } ).success )
      .toBe( false )
    expect( SummarizeInboxBody.safeParse( { items: refs( 1 ), profile_id: 'x' } ).success )
      .toBe( false )
  } )

  it( 'SummarizeInboxResponse carries jobs', () => {
    expect( SummarizeInboxResponse.safeParse( { jobs: [ job ] } ).success ).toBe( true )
    expect( SummarizeInboxResponse.safeParse( { jobs: [ { id: 'x' } ] } ).success ).toBe( false )
  } )
} )

describe( 'DismissInboxBody', () => {
  it( 'accepts 1 to 200 refs', () => {
    expect( DismissInboxBody.safeParse( { items: refs( 1 ) } ).success ).toBe( true )
    expect( DismissInboxBody.safeParse( { items: refs( 200 ) } ).success ).toBe( true )
    expect( DismissInboxBody.safeParse( { items: [] } ).success ).toBe( false )
    expect( DismissInboxBody.safeParse( { items: refs( 201 ) } ).success ).toBe( false )
    expect( DismissInboxBody.safeParse( { items: [ { kind: 'feed', id: 'x' } ] } ).success )
      .toBe( false )
  } )
} )
