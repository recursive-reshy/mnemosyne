// Express
import { Router } from 'express'
// Controllers
import {
  connectGmail,
  disconnectGmail,
  getGmailAccount,
  getGmailLabels,
  gmailCallback,
} from '../controllers/gmail.controller.js'

export const gmailRoutes: Router = Router()

gmailRoutes.get( '/gmail/account', getGmailAccount )
gmailRoutes.get( '/gmail/connect', connectGmail )
gmailRoutes.get( '/gmail/oauth/callback', gmailCallback )
gmailRoutes.post( '/gmail/disconnect', disconnectGmail )
gmailRoutes.get( '/gmail/labels', getGmailLabels )
