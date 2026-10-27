// Express
import { Router } from 'express'
// Controllers
import {
  addUser,
  getUsers,
  patchUser,
  removeUser,
  resetUserVault,
} from '../controllers/admin.controller.js'

export const adminRoutes: Router = Router()

adminRoutes.get( '/users', getUsers )
adminRoutes.post( '/users', addUser )
adminRoutes.patch( '/users/:id', patchUser )
adminRoutes.post( '/users/:id/reset-vault', resetUserVault )
adminRoutes.delete( '/users/:id', removeUser )
