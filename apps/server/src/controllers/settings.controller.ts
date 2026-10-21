// Express
import { Request, Response } from 'express'
// Shared
import { GetSettingsResponse, UpdateSettingsBody } from '@mnemosyne/shared'
// Services
import { getSettingsResponse, updateSettings } from '../services/settings.service.js'

export const getAppSettings = async (
  _req: Request,
  res: Response< GetSettingsResponse >,
): Promise< void > => {
  res.status( 200 ).json( await getSettingsResponse() )
}

export const patchAppSettings = async (
  { body }: Request,
  res: Response< GetSettingsResponse >,
): Promise< void > => {
  await updateSettings( UpdateSettingsBody.parse( body ) )

  res.status( 200 ).json( await getSettingsResponse() )
}
