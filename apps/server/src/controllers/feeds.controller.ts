// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CreateFeedBody,
  DismissFeedItemsBody,
  FeedResponse,
  ListFeedItemsResponse,
  ListFeedsResponse,
  PreviewFeedBody,
  PreviewFeedResponse,
  SummarizeFeedItemsBody,
  SummarizeFeedItemsResponse,
  UpdateFeedBody,
} from '@mnemosyne/shared'
// Services
import {
  dismissItems,
  listInbox,
  summarizeItems,
} from '../services/feedInbox.service.js'
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

export const getFeedItems = ( _req: Request, res: Response< ListFeedItemsResponse > ): void => {
  res.status( 200 ).json( { items: listInbox() } )
}

export const summarizeFeedItems = async (
  { body }: Request,
  res: Response< SummarizeFeedItemsResponse >,
): Promise< void > => {
  res.status( 200 ).json( await summarizeItems( SummarizeFeedItemsBody.parse( body ) ) )
}

export const dismissFeedItems = ( { body }: Request, res: Response ): void => {
  dismissItems( DismissFeedItemsBody.parse( body ).ids )

  res.status( 204 ).end()
}
