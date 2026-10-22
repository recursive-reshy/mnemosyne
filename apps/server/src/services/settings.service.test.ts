// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Errors
import { ValidationError } from '../errors.js'
// Repositories
import { findProfileBySeedKey } from '../repositories/promptProfiles.repository.js'
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Melete
import {
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
} from '../melete/prompts.js'
// Summarizer
import { LOCKED_INSTRUCTIONS_ARTICLE, LOCKED_INSTRUCTIONS_VIDEO } from '../summarizer/prompts.js'
// Clients
import { AgentError, checkHealth, fetchInstructions } from '../clients/agent.client.js'
// Config
import { config } from '../config.js'
// Services
import { assertKnownModel, listModels } from './models.service.js'
import { deleteProfile, listProfiles, resolveLinkerPrompt } from './prompts.service.js'
import {
  getDefaultModel,
  getFeedCheckInterval,
  getLockedInstructions,
  getSettings,
  getSettingsResponse,
  resolveLinkingModel,
  updateSettings,
} from './settings.service.js'

vi.mock( './models.service.js' )
vi.mock( '../clients/agent.client.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../clients/agent.client.js' ) >()

  return { ...original, checkHealth: vi.fn(), fetchInstructions: vi.fn() }
} )

const profileIdOf = ( seedKey: string ): string => findProfileBySeedKey( seedKey )?.id ?? ''

const assertMock = vi.mocked( assertKnownModel )
const listModelsMock = vi.mocked( listModels )
const healthMock = vi.mocked( checkHealth )
const instructionsMock = vi.mocked( fetchInstructions )

const modelList = ( ...ids: string[] ): Awaited< ReturnType< typeof listModels > > => ( {
  models: ids.map( ( id ) => ( { id, display_name: id } ) ),
  source: 'api',
} )

const byName = ( name: string ): string => {
  return listProfiles().find( ( profile ) => profile.name === name )?.id ?? ''
}

beforeEach( () => {
  vi.resetAllMocks()
  assertMock.mockResolvedValue( undefined )
  listModelsMock.mockResolvedValue( modelList( 'claude-sonnet-5-5', 'claude-opus-5-5' ) )
} )

describe( 'getSettings', () => {
  it( 'defaults to the shipped model and the Business ideas profile', async () => {
    expect( await getSettings() ).toEqual( {
      default_model: 'claude-sonnet-5-5',
      extraction_model: 'claude-sonnet-5-5',
      default_profile_id: byName( 'Business ideas' ),
      feed_check_interval_minutes: 60,
      linking_enabled: true,
      linking_model: 'claude-sonnet-5-5',
      linker_profile_id: resolveLinkerPrompt().profile.id,
      melete_learning_root: null,
      melete_question_model: 'claude-sonnet-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'typed',
      melete_question_profile_id: profileIdOf( 'melete_questions' ),
      melete_grading_profile_id: profileIdOf( 'melete_grading' ),
    } )
  } )

  it( 'reads the Melete settings from the stored values when there are any', async () => {
    setSetting( 'melete_learning_root', 'Learning' )
    setSetting( 'melete_question_model', 'claude-haiku-5-5' )
    setSetting( 'melete_grading_model', 'claude-opus-5-5' )
    setSetting( 'melete_review_mode', 'quick' )

    expect( await getSettings() ).toMatchObject( {
      melete_learning_root: 'Learning',
      melete_question_model: 'claude-haiku-5-5',
      melete_grading_model: 'claude-opus-5-5',
      melete_review_mode: 'quick',
    } )
  } )

  it( 'reads the extraction model from the stored setting when there is one', async () => {
    setSetting( 'extraction_model', 'claude-haiku-5-5' )

    expect( ( await getSettings() ).extraction_model ).toBe( 'claude-haiku-5-5' )
  } )

  it( 'reads the feed check interval from the stored setting when there is one', async () => {
    setSetting( 'feed_check_interval_minutes', 180 )

    expect( ( await getSettings() ).feed_check_interval_minutes ).toBe( 180 )
  } )

  it( 'turns linking on by default and reads the stored switch', async () => {
    expect( ( await getSettings() ).linking_enabled ).toBe( true )

    setSetting( 'linking_enabled', false )

    expect( ( await getSettings() ).linking_enabled ).toBe( false )
  } )

  it( 'reads the linking model from the stored setting without asking for models', async () => {
    setSetting( 'linking_model', 'claude-opus-5-5' )

    expect( ( await getSettings() ).linking_model ).toBe( 'claude-opus-5-5' )
    expect( listModelsMock ).not.toHaveBeenCalled()
  } )

  it( 'gives the id of the seeded linker profile, not a summary profile', async () => {
    const { linker_profile_id, default_profile_id } = await getSettings()

    expect( linker_profile_id ).toBe( resolveLinkerPrompt().profile.id )
    expect( linker_profile_id ).not.toBe( default_profile_id )
  } )
} )

describe( 'resolveLinkingModel', () => {
  it( 'defaults to the first Haiku the model list gives', async () => {
    listModelsMock.mockResolvedValue( modelList(
      'claude-opus-5-5',
      'claude-haiku-5-5',
      'claude-haiku-4-5',
    ) )

    expect( await resolveLinkingModel() ).toBe( 'claude-haiku-5-5' )
  } )

  it( 'falls back to the shipped default when the list has no Haiku', async () => {
    expect( await resolveLinkingModel() ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'falls back to the shipped default when the models cannot be listed', async () => {
    listModelsMock.mockRejectedValue( new Error( 'offline' ) )

    expect( await resolveLinkingModel() ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'prefers the stored model over any Haiku', async () => {
    listModelsMock.mockResolvedValue( modelList( 'claude-haiku-5-5' ) )
    setSetting( 'linking_model', 'claude-opus-5-5' )

    expect( await resolveLinkingModel() ).toBe( 'claude-opus-5-5' )
  } )

  it( 'shows up in the settings when nothing is stored', async () => {
    listModelsMock.mockResolvedValue( modelList( 'claude-haiku-5-5', 'claude-sonnet-5-5' ) )

    expect( ( await getSettings() ).linking_model ).toBe( 'claude-haiku-5-5' )
  } )
} )

describe( 'getDefaultModel and getFeedCheckInterval', () => {
  it( 'read the stored values without asking for models', () => {
    expect( getDefaultModel() ).toBe( 'claude-sonnet-5-5' )
    expect( getFeedCheckInterval() ).toBe( 60 )

    setSetting( 'default_model', 'claude-opus-5-5' )
    setSetting( 'feed_check_interval_minutes', 15 )

    expect( getDefaultModel() ).toBe( 'claude-opus-5-5' )
    expect( getFeedCheckInterval() ).toBe( 15 )
    expect( listModelsMock ).not.toHaveBeenCalled()
  } )
} )

describe( 'getSettingsResponse', () => {
  const agent = { url: 'http://agent:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }

  afterEach( () => {
    config.agent = null
  } )

  it( 'says not configured, and asks the agent nothing, without an agent', async () => {
    const response = await getSettingsResponse()

    expect( response ).toMatchObject( {
      linker_locked_instructions: null,
      agent_status: 'not_configured',
      locked_instructions: getLockedInstructions(),
    } )
    expect( healthMock ).not.toHaveBeenCalled()
    expect( instructionsMock ).not.toHaveBeenCalled()
  } )

  it( 'carries the agent\'s locked instructions when it is up', async () => {
    config.agent = agent
    healthMock.mockResolvedValue( 'ok' )
    instructionsMock.mockResolvedValue( 'You link notes.' )

    expect( await getSettingsResponse() ).toMatchObject( {
      linker_locked_instructions: 'You link notes.',
      agent_status: 'ok',
    } )
  } )

  it( 'says unavailable, with no instructions asked for, when the agent is down', async () => {
    config.agent = agent
    healthMock.mockResolvedValue( 'unavailable' )

    expect( await getSettingsResponse() ).toMatchObject( {
      linker_locked_instructions: null,
      agent_status: 'unavailable',
    } )
    expect( instructionsMock ).not.toHaveBeenCalled()
  } )

  it( 'still answers, with no instructions, when fetching them fails', async () => {
    config.agent = agent
    healthMock.mockResolvedValue( 'ok' )
    instructionsMock.mockRejectedValue( new AgentError( 'Agent service rejected the secret' ) )

    expect( await getSettingsResponse() ).toMatchObject( {
      linker_locked_instructions: null,
      agent_status: 'ok',
    } )
  } )
} )

describe( 'getLockedInstructions', () => {
  it( 'returns the locked instructions for videos and articles', () => {
    expect( getLockedInstructions() ).toEqual( {
      video: LOCKED_INSTRUCTIONS_VIDEO,
      article: LOCKED_INSTRUCTIONS_ARTICLE,
      melete_questions: LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
      melete_grading: LOCKED_INSTRUCTIONS_MELETE_GRADING,
    } )
  } )
} )

describe( 'updateSettings', () => {
  it( 'saves a known model', async () => {
    const settings = await updateSettings( { default_model: 'claude-opus-5-5' } )

    expect( assertMock ).toHaveBeenCalledWith( 'claude-opus-5-5' )
    expect( settings.default_model ).toBe( 'claude-opus-5-5' )
    expect( ( await getSettings() ).default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'saves a known linking model and the linking switch', async () => {
    const settings = await updateSettings( {
      linking_model: 'claude-opus-5-5',
      linking_enabled: false,
    } )

    expect( assertMock ).toHaveBeenCalledWith( 'claude-opus-5-5' )
    expect( settings ).toMatchObject( { linking_model: 'claude-opus-5-5', linking_enabled: false } )
    expect( getSetting( 'linking_model' ) ).toBe( 'claude-opus-5-5' )
    expect( getSetting( 'linking_enabled' ) ).toBe( false )
  } )

  it( 'rejects an unknown linking model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings( { linking_model: 'nope', linking_enabled: false } ) )
      .rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( 'linking_model' ) ).toBeUndefined()
    expect( getSetting( 'linking_enabled' ) ).toBeUndefined()
  } )

  it( 'saves a known extraction model', async () => {
    const settings = await updateSettings( { extraction_model: 'claude-haiku-5-5' } )

    expect( assertMock ).toHaveBeenCalledWith( 'claude-haiku-5-5' )
    expect( settings.extraction_model ).toBe( 'claude-haiku-5-5' )
    expect( getSetting( 'extraction_model' ) ).toBe( 'claude-haiku-5-5' )
    expect( settings.default_model ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'rejects an unknown extraction model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings( { extraction_model: 'nope' } ) )
      .rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( 'extraction_model' ) ).toBeUndefined()
  } )

  it( 'saves an active profile', async () => {
    const coding = byName( 'Coding' )

    await updateSettings( { default_profile_id: coding } )

    expect( ( await getSettings() ).default_profile_id ).toBe( coding )
  } )

  it( 'saves both together', async () => {
    const coding = byName( 'Coding' )

    const settings = await updateSettings( {
      default_model: 'claude-opus-5-5',
      default_profile_id: coding,
    } )

    expect( settings ).toEqual( {
      default_model: 'claude-opus-5-5',
      extraction_model: 'claude-sonnet-5-5',
      default_profile_id: coding,
      feed_check_interval_minutes: 60,
      linking_enabled: true,
      linking_model: 'claude-sonnet-5-5',
      linker_profile_id: resolveLinkerPrompt().profile.id,
      melete_learning_root: null,
      melete_question_model: 'claude-sonnet-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'typed',
      melete_question_profile_id: profileIdOf( 'melete_questions' ),
      melete_grading_profile_id: profileIdOf( 'melete_grading' ),
    } )
  } )

  it( 'rejects an unknown model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings( {
      default_model: 'nope',
      default_profile_id: byName( 'Coding' ),
    } ) ).rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( 'default_model' ) ).toBeUndefined()
    expect( ( await getSettings() ).default_profile_id ).toBe( byName( 'Business ideas' ) )
  } )

  it( 'rejects an unknown profile', async () => {
    await expect( updateSettings( { default_profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'rejects the linker profile as the default summary profile', async () => {
    await expect( updateSettings( { default_profile_id: resolveLinkerPrompt().profile.id } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'rejects a deleted profile', async () => {
    const coding = byName( 'Coding' )
    deleteProfile( coding )

    await expect( updateSettings( { default_profile_id: coding } ) )
      .rejects.toThrow( ValidationError )
  } )
} )
