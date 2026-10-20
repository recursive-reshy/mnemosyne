// Express
import { Router } from 'express'
// Controllers
import {
  dismissInbox,
  getInbox,
  summarizeInbox,
} from '../controllers/inbox.controller.js'

export const inboxRoutes: Router = Router()

inboxRoutes.get( '/inbox', getInbox )
inboxRoutes.post( '/inbox/summarize', summarizeInbox )
inboxRoutes.post( '/inbox/dismiss', dismissInbox )
