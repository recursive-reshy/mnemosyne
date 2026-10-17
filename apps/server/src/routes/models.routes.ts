// Express
import { Router } from 'express'
// Controllers
import { getModels } from '../controllers/models.controller.js'

export const modelsRoutes: Router = Router()

modelsRoutes.get( '/models', getModels )
