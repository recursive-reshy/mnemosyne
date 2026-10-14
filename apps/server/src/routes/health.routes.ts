// Express
import { Router } from 'express'
// Controllers
import { getHealth } from '../controllers/health.controller.js'

export const healthRoutes: Router = Router()

healthRoutes.get( '/health', getHealth )
