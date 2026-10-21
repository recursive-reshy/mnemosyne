// Packages
import { z } from 'zod'
// Shared
import {
  FeedCheckInterval,
  GetSettingsResponse,
  Settings,
  UpdateSettingsBody,
} from '@mnemosyne/shared'
// Clients
import { AgentError, checkHealth, fetchInstructions } from '../clients/agent.client.js'
// Config
import { config } from '../config.js'
// Repositories
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from '../summarizer/models.js'
import { LOCKED_INSTRUCTIONS_ARTICLE, LOCKED_INSTRUCTIONS_VIDEO } from '../summarizer/prompts.js'
// Services
import { assertKnownModel, listModels } from './models.service.js'
import {
  assertActiveProfile,
  resolveLinkerPrompt,
  resolvePrompt,
} from './prompts.service.js'

const DEFAULT_FEED_INTERVAL = 60

const storedModel = ( key: string ): string | undefined => {
  const stored = getSetting( key )

  return typeof stored === 'string' ? stored : undefined
}

export const getDefaultModel = (): string => {
  return storedModel( 'default_model' ) ?? SHIPPED_DEFAULT_MODEL
}

export const getFeedCheckInterval = (): FeedCheckInterval => {
  const interval = FeedCheckInterval.safeParse( getSetting( 'feed_check_interval_minutes' ) )

  return interval.success ? interval.data : DEFAULT_FEED_INTERVAL
}

export const isLinkingEnabled = (): boolean => {
  const stored = z.boolean().safeParse( getSetting( 'linking_enabled' ) )

  return stored.success ? stored.data : true
}

// The model list comes newest first, so the first Haiku is the newest one (ADR 0047)
export const resolveLinkingModel = async (): Promise< string > => {
  const stored = storedModel( 'linking_model' )

  if( stored !== undefined ) {
    return stored
  }

  try {
    const { models } = await listModels()

    return models.find( ( { id } ) => id.includes( 'haiku' ) )?.id ?? SHIPPED_DEFAULT_MODEL
  } catch( error ) {
    console.error( 'Could not pick a linking model', error )

    return SHIPPED_DEFAULT_MODEL
  }
}

export const getSettings = async (): Promise< Settings > => {
  return {
    default_model: getDefaultModel(),
    extraction_model: storedModel( 'extraction_model' ) ?? SHIPPED_DEFAULT_MODEL,
    default_profile_id: resolvePrompt( null ).profile.id,
    feed_check_interval_minutes: getFeedCheckInterval(),
    linking_enabled: isLinkingEnabled(),
    linking_model: await resolveLinkingModel(),
    linker_profile_id: resolveLinkerPrompt().profile.id,
  }
}

export const getLockedInstructions = (): GetSettingsResponse[ 'locked_instructions' ] => ( {
  video: LOCKED_INSTRUCTIONS_VIDEO,
  article: LOCKED_INSTRUCTIONS_ARTICLE,
} )

const agentSection = async (): Promise<
  Pick< GetSettingsResponse, 'agent_status' | 'linker_locked_instructions' >
> => {
  if( config.agent === null ) {
    return { agent_status: 'not_configured', linker_locked_instructions: null }
  }

  if( await checkHealth() === 'unavailable' ) {
    return { agent_status: 'unavailable', linker_locked_instructions: null }
  }

  try {
    return { agent_status: 'ok', linker_locked_instructions: await fetchInstructions() }
  } catch( error ) {
    if( !( error instanceof AgentError ) ) {
      throw error
    }

    return { agent_status: 'ok', linker_locked_instructions: null }
  }
}

// A down or misbehaving agent never fails the settings request
export const getSettingsResponse = async (): Promise< GetSettingsResponse > => {
  return {
    settings: await getSettings(),
    locked_instructions: getLockedInstructions(),
    ...await agentSection(),
  }
}

export const updateSettings = async ( body: UpdateSettingsBody ): Promise< Settings > => {
  if( body.default_model !== undefined ) {
    await assertKnownModel( body.default_model )
  }

  if( body.extraction_model !== undefined ) {
    await assertKnownModel( body.extraction_model )
  }

  if( body.linking_model !== undefined ) {
    await assertKnownModel( body.linking_model )
  }

  if( body.default_profile_id !== undefined ) {
    assertActiveProfile( body.default_profile_id )
  }

  if( body.default_model !== undefined ) {
    setSetting( 'default_model', body.default_model )
  }

  if( body.extraction_model !== undefined ) {
    setSetting( 'extraction_model', body.extraction_model )
  }

  if( body.linking_model !== undefined ) {
    setSetting( 'linking_model', body.linking_model )
  }

  if( body.linking_enabled !== undefined ) {
    setSetting( 'linking_enabled', body.linking_enabled )
  }

  if( body.default_profile_id !== undefined ) {
    setSetting( 'default_profile_id', body.default_profile_id )
  }

  if( body.feed_check_interval_minutes !== undefined ) {
    setSetting( 'feed_check_interval_minutes', body.feed_check_interval_minutes )
  }

  return getSettings()
}
