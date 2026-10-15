// Express
import { Request, Response } from 'express'

export const getHealth = ( _request: Request, res: Response ): void => {
  res.status( 200 ).json( { status: 'ok' } )
}
