// Express
import { Request, Response } from 'express'
// Shared
import { ListFoldersResponse } from '@mnemosyne/shared'
// Services
import { listFolders } from '../services/vault.service.js'

export const getFolders = async (
  _req: Request,
  res: Response< ListFoldersResponse >,
): Promise< void > => {
  res.status( 200 ).json( await listFolders() )
}
