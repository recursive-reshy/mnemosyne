// Express
import { Router } from 'express'
// Controllers
import {
  addGmailSource,
  checkEveryGmailSource,
  checkOneGmailSource,
  getGmailSources,
  patchGmailSource,
  previewGmailSource,
  removeGmailSource,
} from '../controllers/gmailSources.controller.js'

export const gmailSourcesRoutes: Router = Router()

gmailSourcesRoutes.get( '/gmail/sources', getGmailSources )
gmailSourcesRoutes.post( '/gmail/sources/preview', previewGmailSource )
gmailSourcesRoutes.post( '/gmail/sources/check', checkEveryGmailSource )
gmailSourcesRoutes.post( '/gmail/sources', addGmailSource )
gmailSourcesRoutes.patch( '/gmail/sources/:id', patchGmailSource )
gmailSourcesRoutes.delete( '/gmail/sources/:id', removeGmailSource )
gmailSourcesRoutes.post( '/gmail/sources/:id/check', checkOneGmailSource )
