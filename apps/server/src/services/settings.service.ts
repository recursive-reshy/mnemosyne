// Shared
import { Settings, UpdateSettingsBody } from '@mnemosyne/shared'
// Repositories
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from '../summarizer/models.js'
import { LOCKED_INSTRUCTIONS } from '../summarizer/prompts.js'
// Services
import { assertKnownModel } from './models.service.js'
import { assertActiveProfile, resolvePrompt } from './prompts.service.js'

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
    assertActiveProfile( body.default_profile_id )
  }

  if( body.default_model !== undefined ) {
    setSetting( 'default_model', body.default_model )
  }

  if( body.default_profile_id !== undefined ) {
    setSetting( 'default_profile_id', body.default_profile_id )
  }

  return getSettings()
}
