// Express
import { Router } from 'express'
// Controllers
import {
  addFeed,
  checkEveryFeed,
  checkOneFeed,
  getFeeds,
  patchFeed,
  previewFeedAddress,
  removeFeed,
} from '../controllers/feeds.controller.js'

export const feedsRoutes: Router = Router()

feedsRoutes.get( '/feeds', getFeeds )
feedsRoutes.post( '/feeds/preview', previewFeedAddress )
feedsRoutes.post( '/feeds/check', checkEveryFeed )
feedsRoutes.post( '/feeds', addFeed )
feedsRoutes.patch( '/feeds/:id', patchFeed )
feedsRoutes.delete( '/feeds/:id', removeFeed )
feedsRoutes.post( '/feeds/:id/check', checkOneFeed )
