// Express
import { Router } from 'express'
// Controllers
import { getFolders } from '../controllers/vault.controller.js'

export const vaultRoutes: Router = Router()

vaultRoutes.get( '/vault/folders', getFolders )
