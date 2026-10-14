// Express
import { Request, Response } from 'express'

export function getHealth( _request: Request, res: Response ): void {
  res.status( 200 ).json( { status: 'ok' } )
}
