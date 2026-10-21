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

export const getAppSettings = ( _req: Request, res: Response< GetSettingsResponse > ): void => {
  res.status( 200 ).json( {
    settings: getSettings(),
    locked_instructions: getLockedInstructions(),
    // Placeholders until task 6.4 asks the agent service
    linker_locked_instructions: null,
    agent_status: 'not_configured',
  } )
}

export const patchAppSettings = async (
  { body }: Request,
  res: Response< GetSettingsResponse >,
): Promise< void > => {
  const settings = await updateSettings( UpdateSettingsBody.parse( body ) )

  res.status( 200 ).json( {
    settings,
    locked_instructions: getLockedInstructions(),
    linker_locked_instructions: null,
    agent_status: 'not_configured',
  } )
}
