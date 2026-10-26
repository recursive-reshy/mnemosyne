// Express
import { Router } from 'express'
// Controllers
import {
  chooseVault,
  makeVault,
  readMe,
  readVaultChoices,
} from '../controllers/me.controller.js'

export const meRoutes: Router = Router()

meRoutes.get( '/me', readMe )
meRoutes.get( '/me/vaults', readVaultChoices )
meRoutes.post( '/me/vault', chooseVault )
meRoutes.post( '/me/vault/new', makeVault )
