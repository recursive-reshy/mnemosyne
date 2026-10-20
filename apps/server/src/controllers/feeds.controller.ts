// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CreateFeedBody,
  FeedResponse,
  ListFeedsResponse,
  PreviewFeedBody,
  PreviewFeedResponse,
  UpdateFeedBody,
} from '@mnemosyne/shared'
// Services
import {
  DismissFeedItemsBody,
  ListFeedItemsResponse,
  SummarizeFeedItemsBody,
  SummarizeFeedItemsResponse,
} from '../services/feedItems.schemas.js'
import {
  dismissItems,
  listInbox,
  summarizeItems,
} from '../services/inbox.service.js'
import {
  checkAllFeeds,
  checkFeed,
  createFeed,
  deleteFeed,
  listFeeds,
  previewFeed,
  updateFeed,
} from '../services/feeds.service.js'

const DeleteQuery = z.object( {
  remove_items: z.enum( [ 'true', 'false' ] ).default( 'false' ),
} )

export const getFeeds = ( _req: Request, res: Response< ListFeedsResponse > ): void => {
  res.status( 200 ).json( { feeds: listFeeds() } )
}

export const previewFeedAddress = async (
  { body }: Request,
  res: Response< PreviewFeedResponse >,
): Promise< void > => {
  const { url } = PreviewFeedBody.parse( body )

  res.status( 200 ).json( await previewFeed( url ) )
}

export const addFeed = async (
  { body }: Request,
  res: Response< FeedResponse >,
): Promise< void > => {
  const feed = await createFeed( CreateFeedBody.parse( body ) )

  res.status( 201 ).json( { feed } )
}

export const patchFeed = (
  { params, body }: Request,
  res: Response< FeedResponse >,
): void => {
  const feed = updateFeed( String( params.id ), UpdateFeedBody.parse( body ) )

  res.status( 200 ).json( { feed } )
}

export const removeFeed = ( { params, query }: Request, res: Response ): void => {
  const { remove_items } = DeleteQuery.parse( query )

  deleteFeed( String( params.id ), { removeInboxItems: remove_items === 'true' } )

  res.status( 204 ).end()
}

export const checkOneFeed = async (
  { params }: Request,
  res: Response< FeedResponse >,
): Promise< void > => {
  res.status( 200 ).json( { feed: await checkFeed( String( params.id ) ) } )
}

export const checkEveryFeed = async (
  _req: Request,
  res: Response< ListFeedsResponse >,
): Promise< void > => {
  await checkAllFeeds()

  res.status( 200 ).json( { feeds: listFeeds() } )
}

// The feed-item routes stay as they were until 8.4 replaces them with /api/inbox (ADR 0039), so
// they answer for feed items only and speak in ids.
export const getFeedItems = ( _req: Request, res: Response< ListFeedItemsResponse > ): void => {
  const items = listInbox().flatMap( ( item ) => {
    if( item.kind !== 'feed' ) {
      return []
    }

    return [ {
      id: item.id,
      feed_id: item.feed_id,
      feed_name: item.feed_name,
      title: item.title,
      link: item.link,
      published_at: item.published_at,
      source_type: item.source_type,
      added_at: item.added_at,
    } ]
  } )

  res.status( 200 ).json( { items } )
}

export const summarizeFeedItems = async (
  { body }: Request,
  res: Response< SummarizeFeedItemsResponse >,
): Promise< void > => {
  const { ids, ...choices } = SummarizeFeedItemsBody.parse( body )
  const items = ids.map( ( id ) => ( { kind: 'feed' as const, id } ) )

  res.status( 200 ).json( await summarizeItems( { items, ...choices } ) )
}

export const dismissFeedItems = ( { body }: Request, res: Response ): void => {
  const { ids } = DismissFeedItemsBody.parse( body )

  dismissItems( ids.map( ( id ) => ( { kind: 'feed' as const, id } ) ) )

  res.status( 204 ).end()
}
