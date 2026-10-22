// Express
import { Router } from 'express'
// Controllers
import {
  readHealthErrors,
  readStatus,
  refreshAllStatus,
} from '../controllers/status.controller.js'

export const statusRoutes: Router = Router()

statusRoutes.get( '/status', readStatus )
statusRoutes.post( '/status/refresh', refreshAllStatus )
statusRoutes.get( '/status/:kind/:id/errors', readHealthErrors )
