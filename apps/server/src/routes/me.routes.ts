// Express
import { Router } from 'express'
// Controllers
import { readMe } from '../controllers/me.controller.js'

export const meRoutes: Router = Router()

meRoutes.get( '/me', readMe )
