// Express
import type { Request, Response } from 'express'
// Shared
import type { Me } from '@mnemosyne/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { getMe } from '../services/auth.service.js'

export const readMe = ( req: Request, res: Response< Me > ): void => {
  res.status( 200 ).json( getMe( currentUser( req ).id ) )
}
