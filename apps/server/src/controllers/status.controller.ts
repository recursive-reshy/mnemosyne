// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import { GetHealthErrorsResponse, GetStatusResponse, HealthKind } from '@mnemosyne/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { getHealthErrors, getStatus, refreshStatus } from '../services/status.service.js'

const ErrorsParams = z.object( { kind: HealthKind, id: z.string().min( 1 ) } )

export const readStatus = ( req: Request, res: Response< GetStatusResponse > ): void => {
  res.status( 200 ).json( getStatus( currentUser( req ).id ) )
}

export const refreshAllStatus = async (
  req: Request,
  res: Response< GetStatusResponse >,
): Promise< void > => {
  res.status( 200 ).json( await refreshStatus( currentUser( req ).id ) )
}

export const readHealthErrors = (
  req: Request,
  res: Response< GetHealthErrorsResponse >,
): void => {
  const { kind, id } = ErrorsParams.parse( req.params )

  res.status( 200 ).json( { errors: getHealthErrors( currentUser( req ).id, kind, id ) } )
}
