// Express
import { Router } from 'express'
// Controllers
import {
  addFeed,
  checkEveryFeed,
  checkOneFeed,
  dismissFeedItems,
  getFeedItems,
  getFeeds,
  patchFeed,
  previewFeedAddress,
  removeFeed,
  summarizeFeedItems,
} from '../controllers/feeds.controller.js'

export const feedsRoutes: Router = Router()

feedsRoutes.get( '/feeds', getFeeds )
feedsRoutes.post( '/feeds/preview', previewFeedAddress )
feedsRoutes.post( '/feeds/check', checkEveryFeed )
feedsRoutes.post( '/feeds', addFeed )
feedsRoutes.patch( '/feeds/:id', patchFeed )
feedsRoutes.delete( '/feeds/:id', removeFeed )
feedsRoutes.post( '/feeds/:id/check', checkOneFeed )
feedsRoutes.get( '/feed-items', getFeedItems )
feedsRoutes.post( '/feed-items/summarize', summarizeFeedItems )
feedsRoutes.post( '/feed-items/dismiss', dismissFeedItems )
