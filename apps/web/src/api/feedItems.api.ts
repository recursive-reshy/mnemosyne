// Shared
import { ListFeedItemsResponse, SummarizeFeedItemsResponse } from '@mnemosyne/shared'
import type { FeedItem, Job, SummarizeFeedItemsBody } from '@mnemosyne/shared'
// App
import { request, send } from './request'

const postJson = ( body: unknown ): RequestInit => {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

export const listFeedItems = async (): Promise< FeedItem[] > => {
  const { items } = await request( '/api/feed-items', ListFeedItemsResponse )
  return items
}

export const summarizeFeedItems = async ( body: SummarizeFeedItemsBody ): Promise< Job[] > => {
  const { jobs } = await request(
    '/api/feed-items/summarize',
    SummarizeFeedItemsResponse,
    postJson( body ),
  )
  return jobs
}

export const dismissFeedItems = async ( ids: string[] ): Promise< void > => {
  await send( '/api/feed-items/dismiss', postJson( { ids } ) )
}
