// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { describe, it, expect } from 'vitest'
// Config
import { loadConfig } from './config.js'

const base = { ANTHROPIC_API_KEY: 'sk-test', VAULT_PATH: '/vault' }

describe( 'loadConfig', () => {
  it( 'returns the defaults for a minimal environment', () => {
    expect( loadConfig( base ) ).toEqual( {
      port: 3100,
      whisperUrl: 'http://localhost:8178',
      workDir: join( tmpdir(), 'mnemosyne' ),
      dataDir: join( tmpdir(), 'mnemosyne-data' ),
      whisperModel: 'large-v3-turbo',
      webDir: undefined,
      anthropicApiKey: 'sk-test',
      vaultPath: '/vault',
      summaryTimeoutMs: 300_000,
      reviewTtlHours: 24,
      cleanupIntervalMinutes: 15,
    } )
  } )

  it( 'returns overrides, with numbers as numbers', () => {
    const config = loadConfig( {
      ...base,
      VAULT_PATH: '/Users/x/Vault',
      PORT: '4000',
      WHISPER_URL: 'http://host.docker.internal:8178',
      WORK_DIR: '/tmp/custom',
      DATA_DIR: '/data',
      WHISPER_MODEL: 'large-v3',
      WEB_DIR: '/srv/web',
      SUMMARY_TIMEOUT_MS: '60000',
      REVIEW_TTL_HOURS: '48',
      CLEANUP_INTERVAL_MINUTES: '5',
    } )

    expect( config ).toEqual( {
      port: 4000,
      whisperUrl: 'http://host.docker.internal:8178',
      workDir: '/tmp/custom',
      dataDir: '/data',
      whisperModel: 'large-v3',
      webDir: '/srv/web',
      anthropicApiKey: 'sk-test',
      vaultPath: '/Users/x/Vault',
      summaryTimeoutMs: 60_000,
      reviewTtlHours: 48,
      cleanupIntervalMinutes: 5,
    } )
  } )

  it( 'treats empty strings as unset', () => {
    const config = loadConfig( { ...base, PORT: '', WHISPER_URL: '' } )

    expect( config.port ).toBe( 3100 )
    expect( config.whisperUrl ).toBe( 'http://localhost:8178' )
  } )

  it( 'treats an empty DATA_DIR as unset', () => {
    expect( loadConfig( { ...base, DATA_DIR: '' } ).dataDir ).toBe(
      join( tmpdir(), 'mnemosyne-data' ),
    )
  } )

  it( 'falls back to the default model for an empty WHISPER_MODEL', () => {
    expect( loadConfig( { ...base, WHISPER_MODEL: '' } ).whisperModel ).toBe( 'large-v3-turbo' )
  } )

  it( 'reads WEB_DIR and treats an empty value as unset', () => {
    expect( loadConfig( { ...base, WEB_DIR: '/srv/web' } ).webDir ).toBe( '/srv/web' )
    expect( loadConfig( { ...base, WEB_DIR: '' } ).webDir ).toBeUndefined()
  } )

  it( 'treats empty summary and cleanup settings as unset', () => {
    const config = loadConfig( {
      ...base,
      SUMMARY_TIMEOUT_MS: '',
      REVIEW_TTL_HOURS: '',
      CLEANUP_INTERVAL_MINUTES: '',
    } )

    expect( config.cleanupIntervalMinutes ).toBe( 15 )
    expect( config.summaryTimeoutMs ).toBe( 300_000 )
    expect( config.reviewTtlHours ).toBe( 24 )
  } )

  it.each( [ 'abc', '0', '70000' ] )( 'throws naming PORT for PORT=%s', ( port ) => {
    expect( () => loadConfig( { ...base, PORT: port } ) ).toThrow( /PORT/ )
  } )

  it( 'throws naming WHISPER_URL for an invalid URL', () => {
    expect( () => loadConfig( { ...base, WHISPER_URL: 'not-a-url' } ) ).toThrow( /WHISPER_URL/ )
  } )

  it.each( [ undefined, '' ] )( 'throws naming ANTHROPIC_API_KEY when it is %j', ( key ) => {
    expect( () => loadConfig( { ANTHROPIC_API_KEY: key } ) ).toThrow( /ANTHROPIC_API_KEY/ )
  } )

  it.each( [ undefined, '' ] )( 'throws naming VAULT_PATH when it is %j', ( path ) => {
    expect( () => loadConfig( { ...base, VAULT_PATH: path } ) ).toThrow( /VAULT_PATH/ )
  } )

  it.each( [ 'abc', '0', '-5', '1.5' ] )( 'throws naming SUMMARY_TIMEOUT_MS for %s', ( value ) => {
    expect( () => loadConfig( { ...base, SUMMARY_TIMEOUT_MS: value } ) ).toThrow(
      /SUMMARY_TIMEOUT_MS/,
    )
  } )

  it.each( [ 'abc', '0', '-1' ] )( 'throws naming REVIEW_TTL_HOURS for %s', ( value ) => {
    expect( () => loadConfig( { ...base, REVIEW_TTL_HOURS: value } ) ).toThrow( /REVIEW_TTL_HOURS/ )
  } )

  it.each( [ 'abc', '0', '-1' ] )( 'throws naming CLEANUP_INTERVAL_MINUTES for %s', ( value ) => {
    expect( () => loadConfig( { ...base, CLEANUP_INTERVAL_MINUTES: value } ) ).toThrow(
      /CLEANUP_INTERVAL_MINUTES/,
    )
  } )

  it( 'ignores unrelated variables', () => {
    expect( () => loadConfig( { ...base, HOME: '/Users/x', PATH: '/usr/bin' } ) ).not.toThrow()
  } )
} )
