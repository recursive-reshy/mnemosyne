// Express
import { Router } from 'express'
// Controllers
import { getAppSettings, patchAppSettings } from '../controllers/settings.controller.js'

export const settingsRoutes: Router = Router()

settingsRoutes.get( '/settings', getAppSettings )
settingsRoutes.patch( '/settings', patchAppSettings )
