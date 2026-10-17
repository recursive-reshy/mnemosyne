// Express
import { Request, Response } from 'express'
// Shared
import { ListModelsResponse } from '@mnemosyne/shared'
// Services
import { listModels } from '../services/models.service.js'

export const getModels = async (
  _req: Request,
  res: Response< ListModelsResponse >,
): Promise< void > => {
  res.status( 200 ).json( await listModels() )
}
