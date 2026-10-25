// Express
import { Router } from 'express'
// Controllers
import {
  finishSignIn,
  signOut,
  startSignIn,
} from '../controllers/auth.controller.js'

export const authRoutes: Router = Router()

authRoutes.get( '/auth/google', startSignIn )
authRoutes.get( '/auth/callback', finishSignIn )
authRoutes.post( '/auth/signout', signOut )
