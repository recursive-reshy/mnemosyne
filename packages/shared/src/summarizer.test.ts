// Packages
import { describe, it, expect } from 'vitest'
// Summarizer
import {
  CreatePromptProfileBody,
  GetSettingsResponse,
  Guidance,
  ListModelsResponse,
  ListPromptProfilesResponse,
  ListPromptVersionsResponse,
  ModelOption,
  ProfileName,
  PromptProfile,
  PromptProfileResponse,
  PromptVersion,
  PromptVersionSource,
  RegenerateSummaryBody,
  RenamePromptProfileBody,
  SavePromptVersionBody,
  Settings,
  SummaryRun,
  SummaryUsage,
  UpdateSettingsBody,
} from './summarizer.js'

const profileId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const now = '2026-10-17T10:00:00.000Z'

const version = {
  id: 1,
  profile_id: profileId,
  version: 1,
  guidance: 'Focus on ideas.',
  source: 'seed',
  created_at: now,
}

const profile = {
  id: profileId,
  name: 'Business ideas',
  can_reset: true,
  current_version: version,
  created_at: now,
}

const run = {
  model: 'claude-sonnet-5-5',
  profile_id: profileId,
  profile_name: 'Business ideas',
  prompt_version: 3,
  input_tokens: 31200,
  output_tokens: 1400,
  cost_usd: 0.12,
  outcome: 'succeeded',
  created_at: now,
}

describe( 'ModelOption and ListModelsResponse', () => {
  it( 'accepts a model option', () => {
    const option = { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }

    expect( ModelOption.safeParse( option ).success ).toBe( true )
  } )

  it.each( [ 'api', 'fallback' ] )( 'accepts source %s', ( source ) => {
    expect( ListModelsResponse.safeParse( { models: [], source } ).success ).toBe( true )
  } )

  it( 'rejects an unknown source', () => {
    expect( ListModelsResponse.safeParse( { models: [], source: 'cache' } ).success ).toBe( false )
  } )
} )

describe( 'Settings', () => {
  const settings = {
    default_model: 'm',
    default_profile_id: profileId,
    feed_check_interval_minutes: 60,
  }

  it( 'accepts a model, a profile id and a feed interval', () => {
    expect( Settings.safeParse( settings ).success ).toBe( true )
  } )

  it( 'rejects a profile id that is not a uuid', () => {
    expect( Settings.safeParse( { ...settings, default_profile_id: 'x' } ).success ).toBe( false )
  } )

  it.each( [ 15, 30, 60, 180, 360, 1440 ] )( 'accepts a feed interval of %s', ( minutes ) => {
    expect( Settings.safeParse( { ...settings, feed_check_interval_minutes: minutes } ).success )
      .toBe( true )
  } )

  it.each( [ 0, 5, 45, '60' ] )( 'rejects a feed interval of %s', ( minutes ) => {
    expect( Settings.safeParse( { ...settings, feed_check_interval_minutes: minutes } ).success )
      .toBe( false )
  } )

  it( 'GetSettingsResponse carries the locked instructions for videos and articles', () => {
    const body = {
      settings,
      locked_instructions: { video: 'video text', article: 'article text' },
    }

    expect( GetSettingsResponse.safeParse( body ).success ).toBe( true )
    expect( GetSettingsResponse.safeParse( { settings } ).success ).toBe( false )
    expect( GetSettingsResponse.safeParse( { ...body, locked_instructions: 'text' } ).success )
      .toBe( false )
    expect( GetSettingsResponse.safeParse( {
      ...body,
      locked_instructions: { video: 'only' },
    } ).success ).toBe( false )
  } )
} )

describe( 'UpdateSettingsBody', () => {
  it( 'accepts a model alone', () => {
    expect( UpdateSettingsBody.safeParse( { default_model: 'm' } ).success ).toBe( true )
  } )

  it( 'accepts a profile alone', () => {
    expect( UpdateSettingsBody.safeParse( { default_profile_id: profileId } ).success ).toBe( true )
  } )

  it( 'accepts a feed interval alone', () => {
    expect( UpdateSettingsBody.safeParse( { feed_check_interval_minutes: 180 } ).success )
      .toBe( true )
  } )

  it( 'rejects an interval that is not on the list', () => {
    expect( UpdateSettingsBody.safeParse( { feed_check_interval_minutes: 10 } ).success )
      .toBe( false )
  } )

  it( 'rejects an empty body', () => {
    expect( UpdateSettingsBody.safeParse( {} ).success ).toBe( false )
  } )

  it( 'rejects an empty model', () => {
    expect( UpdateSettingsBody.safeParse( { default_model: '' } ).success ).toBe( false )
  } )
} )

describe( 'Guidance', () => {
  it( 'trims', () => {
    expect( Guidance.parse( '  focus  ' ) ).toBe( 'focus' )
  } )

  it( 'rejects empty and whitespace-only text', () => {
    expect( Guidance.safeParse( '' ).success ).toBe( false )
    expect( Guidance.safeParse( '   \n ' ).success ).toBe( false )
  } )

  it( 'accepts 20000 characters and rejects 20001', () => {
    expect( Guidance.safeParse( 'a'.repeat( 20_000 ) ).success ).toBe( true )
    expect( Guidance.safeParse( 'a'.repeat( 20_001 ) ).success ).toBe( false )
  } )
} )

describe( 'ProfileName', () => {
  it( 'trims', () => {
    expect( ProfileName.parse( '  Coding ' ) ).toBe( 'Coding' )
  } )

  it( 'rejects empty text', () => {
    expect( ProfileName.safeParse( '  ' ).success ).toBe( false )
  } )

  it( 'accepts 60 characters and rejects 61', () => {
    expect( ProfileName.safeParse( 'a'.repeat( 60 ) ).success ).toBe( true )
    expect( ProfileName.safeParse( 'a'.repeat( 61 ) ).success ).toBe( false )
  } )
} )

describe( 'PromptVersion', () => {
  it.each( [ 'seed', 'edit', 'restore', 'reset' ] )( 'accepts source %s', ( source ) => {
    expect( PromptVersionSource.safeParse( source ).success ).toBe( true )
    expect( PromptVersion.safeParse( { ...version, source } ).success ).toBe( true )
  } )

  it( 'rejects an unknown source', () => {
    expect( PromptVersionSource.safeParse( 'import' ).success ).toBe( false )
  } )

  it( 'rejects a version below 1', () => {
    expect( PromptVersion.safeParse( { ...version, version: 0 } ).success ).toBe( false )
  } )
} )

describe( 'PromptProfile and its responses', () => {
  it( 'accepts a profile', () => {
    expect( PromptProfile.safeParse( profile ).success ).toBe( true )
  } )

  it( 'rejects a profile without a current version', () => {
    const rest: Record< string, unknown > = { ...profile }
    delete rest.current_version

    expect( PromptProfile.safeParse( rest ).success ).toBe( false )
  } )

  it( 'wraps profiles and versions in their responses', () => {
    expect( ListPromptProfilesResponse.safeParse( { profiles: [ profile ] } ).success ).toBe( true )
    expect( PromptProfileResponse.safeParse( { profile } ).success ).toBe( true )
    expect( ListPromptVersionsResponse.safeParse( { versions: [ version ] } ).success ).toBe( true )
  } )
} )

describe( 'profile request bodies', () => {
  it( 'CreatePromptProfileBody trims name and guidance', () => {
    const parsed = CreatePromptProfileBody.parse( { name: ' A ', guidance: ' g ' } )

    expect( parsed ).toEqual( { name: 'A', guidance: 'g' } )
  } )

  it( 'CreatePromptProfileBody needs both fields', () => {
    expect( CreatePromptProfileBody.safeParse( { name: 'A' } ).success ).toBe( false )
    expect( CreatePromptProfileBody.safeParse( { guidance: 'g' } ).success ).toBe( false )
  } )

  it( 'RenamePromptProfileBody rejects an empty name', () => {
    expect( RenamePromptProfileBody.safeParse( { name: ' ' } ).success ).toBe( false )
  } )

  it( 'SavePromptVersionBody rejects empty guidance', () => {
    expect( SavePromptVersionBody.safeParse( { guidance: '' } ).success ).toBe( false )
  } )
} )

describe( 'SummaryRun and SummaryUsage', () => {
  it( 'accepts a succeeded run', () => {
    expect( SummaryRun.safeParse( run ).success ).toBe( true )
  } )

  it( 'accepts a failed run with no tokens and no cost', () => {
    const failed = {
      ...run,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'failed',
    }

    expect( SummaryRun.safeParse( failed ).success ).toBe( true )
  } )

  it( 'rejects an unknown outcome', () => {
    expect( SummaryRun.safeParse( { ...run, outcome: 'pending' } ).success ).toBe( false )
  } )

  it( 'accepts usage with a total cost', () => {
    const usage = {
      last_run: run,
      run_count: 2,
      total_input_tokens: 60000,
      total_output_tokens: 2800,
      total_cost_usd: 0.24,
    }

    expect( SummaryUsage.safeParse( usage ).success ).toBe( true )
  } )

  it( 'accepts a null total cost', () => {
    const usage = {
      last_run: run,
      run_count: 1,
      total_input_tokens: 1,
      total_output_tokens: 1,
      total_cost_usd: null,
    }

    expect( SummaryUsage.safeParse( usage ).success ).toBe( true )
  } )
} )

describe( 'RegenerateSummaryBody', () => {
  it( 'accepts an empty body', () => {
    expect( RegenerateSummaryBody.safeParse( {} ).success ).toBe( true )
  } )

  it( 'accepts a model and a profile', () => {
    const body = { model: 'm', profile_id: profileId }

    expect( RegenerateSummaryBody.safeParse( body ).success ).toBe( true )
  } )

  it( 'rejects a bad profile id and an empty model', () => {
    expect( RegenerateSummaryBody.safeParse( { profile_id: 'x' } ).success ).toBe( false )
    expect( RegenerateSummaryBody.safeParse( { model: '' } ).success ).toBe( false )
  } )
} )
