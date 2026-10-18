// Express
import { Request, Response } from 'express'
// Shared
import { GetSettingsResponse, UpdateSettingsBody } from '@mnemosyne/shared'
// Services
import {
  getLockedInstructions,
  getSettings,
  updateSettings,
} from '../services/settings.service.js'

// Both texts are the video one until the article instructions exist (task 6.6)
const lockedInstructions = (): GetSettingsResponse[ 'locked_instructions' ] => {
  const text = getLockedInstructions()

  return { video: text, article: text }
}

export const getAppSettings = ( _req: Request, res: Response< GetSettingsResponse > ): void => {
  res.status( 200 ).json( {
    settings: getSettings(),
    locked_instructions: lockedInstructions(),
  } )
}

export const patchAppSettings = async (
  { body }: Request,
  res: Response< GetSettingsResponse >,
): Promise< void > => {
  const settings = await updateSettings( UpdateSettingsBody.parse( body ) )

  res.status( 200 ).json( { settings, locked_instructions: lockedInstructions() } )
}
