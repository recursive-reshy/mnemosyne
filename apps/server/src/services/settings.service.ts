// Shared
import { Settings, UpdateSettingsBody } from '@mnemosyne/shared'
// Errors
import { ValidationError } from '../errors.js'
// Repositories
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from '../summarizer/models.js'
import { LOCKED_INSTRUCTIONS } from '../summarizer/prompts.js'
// Services
import { assertKnownModel } from './models.service.js'
import { listProfiles, resolvePrompt } from './prompts.service.js'

export const getSettings = (): Settings => {
  const model = getSetting( 'default_model' )

  return {
    default_model: typeof model === 'string' ? model : SHIPPED_DEFAULT_MODEL,
    default_profile_id: resolvePrompt( null ).profile.id,
  }
}

export const getLockedInstructions = (): string => LOCKED_INSTRUCTIONS

export const updateSettings = async ( body: UpdateSettingsBody ): Promise< Settings > => {
  if( body.default_model !== undefined ) {
    await assertKnownModel( body.default_model )
  }

  if( body.default_profile_id !== undefined ) {
    if( !listProfiles().some( ( { id } ) => id === body.default_profile_id ) ) {
      throw new ValidationError( 'Unknown prompt profile' )
    }
  }

  if( body.default_model !== undefined ) {
    setSetting( 'default_model', body.default_model )
  }

  if( body.default_profile_id !== undefined ) {
    setSetting( 'default_profile_id', body.default_profile_id )
  }

  return getSettings()
}
