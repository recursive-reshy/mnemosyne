// Shared
import { ListInboxResponse, SummarizeInboxResponse } from '@mnemosyne/shared'
import type {
  InboxItem,
  InboxItemRef,
  Job,
  SummarizeInboxBody,
} from '@mnemosyne/shared'
// App
import { request, send } from './request'
import type { Schema } from './request'

export type FeedInboxItem = Extract< InboxItem, { kind: 'feed' } >

const withKind = ( item: unknown ): unknown => {
  return typeof item === 'object' && item !== null ? { ...item, kind: 'feed' } : item
}

// The server still answers /api/feed-items with items that have no `kind` (ADR 0039).
const FeedItemsResponse: Schema< FeedInboxItem[] > = {
  safeParse: ( data ) => {
    const items: unknown = typeof data === 'object' && data !== null && 'items' in data
      ? data.items
      : null
    const parsed = ListInboxResponse.safeParse(
      { items: Array.isArray( items ) ? items.map( withKind ) : null },
    )

    if( !parsed.success ) {
      return { success: false }
    }

    const feedItems = parsed.data.items.filter(
      ( item ): item is FeedInboxItem => item.kind === 'feed',
    )

    return { success: true, data: feedItems }
  },
}

const postJson = ( body: unknown ): RequestInit => {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

const idsOf = ( items: InboxItemRef[] ): string[] => items.map( ( { id } ) => id )

export const listFeedItems = async (): Promise< FeedInboxItem[] > => {
  return request( '/api/feed-items', FeedItemsResponse )
}

export const summarizeFeedItems = async ( body: SummarizeInboxBody ): Promise< Job[] > => {
  const { items, ...choices } = body
  const { jobs } = await request(
    '/api/feed-items/summarize',
    SummarizeInboxResponse,
    postJson( { ids: idsOf( items ), ...choices } ),
  )
  return jobs
}

export const dismissFeedItems = async ( items: InboxItemRef[] ): Promise< void > => {
  await send( '/api/feed-items/dismiss', postJson( { ids: idsOf( items ) } ) )
}
