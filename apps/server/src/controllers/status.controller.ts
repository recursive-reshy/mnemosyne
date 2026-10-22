// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import { GetHealthErrorsResponse, GetStatusResponse, HealthKind } from '@mnemosyne/shared'
// Services
import { getHealthErrors, getStatus, refreshStatus } from '../services/status.service.js'

const ErrorsParams = z.object( { kind: HealthKind, id: z.string().min( 1 ) } )

export const readStatus = ( _req: Request, res: Response< GetStatusResponse > ): void => {
  res.status( 200 ).json( getStatus() )
}

export const refreshAllStatus = async (
  _req: Request,
  res: Response< GetStatusResponse >,
): Promise< void > => {
  res.status( 200 ).json( await refreshStatus() )
}

export const readHealthErrors = (
  { params }: Request,
  res: Response< GetHealthErrorsResponse >,
): void => {
  const { kind, id } = ErrorsParams.parse( params )

  res.status( 200 ).json( { errors: getHealthErrors( kind, id ) } )
}
