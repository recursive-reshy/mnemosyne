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
      defaultNoteFolder: 'Mnemosyne',
      summaryTimeoutMs: 300_000,
      reviewTtlHours: 24,
      cleanupIntervalMinutes: 15,
      statusCheckIntervalMinutes: 2,
      logLevel: 'info',
      gmail: null,
      agent: null,
    } )
  } )

  it( 'returns overrides, with numbers as numbers', () => {
    const config = loadConfig( {
      ...base,
      VAULT_PATH: '/Users/x/Vault',
      DEFAULT_NOTE_FOLDER: 'Learning/AI',
      PORT: '4000',
      WHISPER_URL: 'http://host.docker.internal:8178',
      WORK_DIR: '/tmp/custom',
      DATA_DIR: '/data',
      WHISPER_MODEL: 'large-v3',
      WEB_DIR: '/srv/web',
      SUMMARY_TIMEOUT_MS: '60000',
      REVIEW_TTL_HOURS: '48',
      CLEANUP_INTERVAL_MINUTES: '5',
      STATUS_CHECK_INTERVAL_MINUTES: '3',
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
      defaultNoteFolder: 'Learning/AI',
      summaryTimeoutMs: 60_000,
      reviewTtlHours: 48,
      cleanupIntervalMinutes: 5,
      statusCheckIntervalMinutes: 3,
      logLevel: 'info',
      gmail: null,
      agent: null,
    } )
  } )

  it.each( [ 'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent' ] )(
    'accepts LOG_LEVEL %s',
    ( level ) => {
      expect( loadConfig( { ...base, LOG_LEVEL: level } ).logLevel ).toBe( level )
    },
  )

  it( 'defaults LOG_LEVEL to info and treats an empty value as unset', () => {
    expect( loadConfig( base ).logLevel ).toBe( 'info' )
    expect( loadConfig( { ...base, LOG_LEVEL: '' } ).logLevel ).toBe( 'info' )
  } )

  it( 'throws naming LOG_LEVEL for an unknown level', () => {
    expect( () => loadConfig( { ...base, LOG_LEVEL: 'loud' } ) ).toThrow( 'LOG_LEVEL' )
  } )

  it( 'falls back to Mnemosyne when DEFAULT_NOTE_FOLDER is empty', () => {
    expect( loadConfig( { ...base, DEFAULT_NOTE_FOLDER: '' } ).defaultNoteFolder )
      .toBe( 'Mnemosyne' )
  } )

  it.each( [ '../x', '/abs', 'a//b', '.hidden', 'a/', 'a:b' ] )(
    'throws naming DEFAULT_NOTE_FOLDER for %j',
    ( folder ) => {
      expect( () => loadConfig( { ...base, DEFAULT_NOTE_FOLDER: folder } ) )
        .toThrow( 'DEFAULT_NOTE_FOLDER' )
    },
  )

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

  it( 'defaults STATUS_CHECK_INTERVAL_MINUTES to 2, also when it is empty', () => {
    const empty = loadConfig( { ...base, STATUS_CHECK_INTERVAL_MINUTES: '' } )

    expect( loadConfig( base ).statusCheckIntervalMinutes ).toBe( 2 )
    expect( empty.statusCheckIntervalMinutes ).toBe( 2 )
  } )

  it( 'reads STATUS_CHECK_INTERVAL_MINUTES as a number', () => {
    expect( loadConfig( { ...base, STATUS_CHECK_INTERVAL_MINUTES: '0.5' } )
      .statusCheckIntervalMinutes ).toBe( 0.5 )
  } )

  it.each( [ 'abc', '0', '-1' ] )(
    'throws naming STATUS_CHECK_INTERVAL_MINUTES for %s',
    ( value ) => {
      expect( () => loadConfig( { ...base, STATUS_CHECK_INTERVAL_MINUTES: value } ) )
        .toThrow( /STATUS_CHECK_INTERVAL_MINUTES/ )
    },
  )

  it.each( [ 'abc', '0', '-1' ] )( 'throws naming CLEANUP_INTERVAL_MINUTES for %s', ( value ) => {
    expect( () => loadConfig( { ...base, CLEANUP_INTERVAL_MINUTES: value } ) ).toThrow(
      /CLEANUP_INTERVAL_MINUTES/,
    )
  } )

  describe( 'agent', () => {
    const secret = 'a'.repeat( 32 )

    it( 'is null when AGENT_SECRET is unset or empty', () => {
      expect( loadConfig( base ).agent ).toBeNull()
      expect( loadConfig( { ...base, AGENT_SECRET: '' } ).agent ).toBeNull()
    } )

    it( 'is null without a secret even when the URL is set', () => {
      expect( loadConfig( { ...base, AGENT_URL: 'http://agent:8100' } ).agent ).toBeNull()
    } )

    it( 'uses the local URL and a two minute timeout by default', () => {
      expect( loadConfig( { ...base, AGENT_SECRET: secret } ).agent ).toEqual( {
        url: 'http://localhost:8100',
        secret,
        timeoutMs: 120_000,
      } )
    } )

    it( 'takes the URL and timeout from the environment, with empty values as unset', () => {
      expect( loadConfig( {
        ...base,
        AGENT_SECRET: secret,
        AGENT_URL: 'http://agent:8100',
        AGENT_TIMEOUT_MS: '30000',
      } ).agent ).toEqual( { url: 'http://agent:8100', secret, timeoutMs: 30_000 } )
      expect( loadConfig( {
        ...base,
        AGENT_SECRET: secret,
        AGENT_URL: '',
        AGENT_TIMEOUT_MS: '',
      } ).agent ).toEqual( { url: 'http://localhost:8100', secret, timeoutMs: 120_000 } )
    } )

    it( 'stops startup naming AGENT_SECRET when it is under 32 characters', () => {
      expect( () => loadConfig( { ...base, AGENT_SECRET: 'short' } ) )
        .toThrow( /AGENT_SECRET/ )
    } )

    it( 'does not echo the secret in the error', () => {
      expect( () => loadConfig( { ...base, AGENT_SECRET: 'too-short-secret' } ) )
        .toThrow( expect.objectContaining( {
          message: expect.not.stringContaining( 'too-short-secret' ) as string,
        } ) )
    } )

    it( 'rejects a URL that is not a URL and a timeout that is not a positive number', () => {
      expect( () => loadConfig( { ...base, AGENT_SECRET: secret, AGENT_URL: 'nope' } ) )
        .toThrow( /AGENT_URL/ )
      expect( () => loadConfig( { ...base, AGENT_SECRET: secret, AGENT_TIMEOUT_MS: '0' } ) )
        .toThrow( /AGENT_TIMEOUT_MS/ )
    } )
  } )

  describe( 'gmail', () => {
    const key = Buffer.alloc( 32, 7 ).toString( 'base64' )
    const google = {
      GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'secret',
      TOKEN_ENCRYPTION_KEY: key,
    }

    it( 'is null when nothing is set', () => {
      expect( loadConfig( base ).gmail ).toBeNull()
    } )

    it.each( [
      [ 'only the client ID', { GOOGLE_CLIENT_ID: 'id' } ],
      [ 'no encryption key', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' } ],
      [ 'no client secret', { GOOGLE_CLIENT_ID: 'id', TOKEN_ENCRYPTION_KEY: key } ],
      [ 'no client ID', { GOOGLE_CLIENT_SECRET: 's', TOKEN_ENCRYPTION_KEY: key } ],
    ] )( 'is null with %s', ( _name, env ) => {
      expect( loadConfig( { ...base, ...env } ).gmail ).toBeNull()
    } )

    it( 'is set when the ID, secret and key are present, with the default redirect URI', () => {
      const { gmail } = loadConfig( { ...base, ...google, PORT: '4000' } )

      expect( gmail ).toEqual( {
        clientId: google.GOOGLE_CLIENT_ID,
        clientSecret: 'secret',
        redirectUri: 'http://localhost:4000/api/gmail/oauth/callback',
        encryptionKey: Buffer.alloc( 32, 7 ),
      } )
      expect( gmail?.encryptionKey ).toHaveLength( 32 )
    } )

    it( 'uses GOOGLE_REDIRECT_URI when set', () => {
      const { gmail } = loadConfig( {
        ...base,
        ...google,
        GOOGLE_REDIRECT_URI: 'http://localhost:5000/cb',
      } )

      expect( gmail?.redirectUri ).toBe( 'http://localhost:5000/cb' )
    } )

    it( 'treats empty strings as unset', () => {
      const { gmail } = loadConfig( {
        ...base,
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        GOOGLE_REDIRECT_URI: '',
        TOKEN_ENCRYPTION_KEY: '',
      } )

      expect( gmail ).toBeNull()
    } )

    it.each( [
      [ '31 bytes', Buffer.alloc( 31, 1 ).toString( 'base64' ) ],
      [ '33 bytes', Buffer.alloc( 33, 1 ).toString( 'base64' ) ],
      [ 'not base64', 'not base64 at all!' ],
    ] )( 'throws for a TOKEN_ENCRYPTION_KEY of %s', ( _name, value ) => {
      expect( () => loadConfig( { ...base, TOKEN_ENCRYPTION_KEY: value } ) ).toThrow(
        'TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)',
      )
    } )

    it( 'throws naming GOOGLE_REDIRECT_URI for an invalid URL', () => {
      expect( () => loadConfig( { ...base, GOOGLE_REDIRECT_URI: 'nope' } ) ).toThrow(
        /GOOGLE_REDIRECT_URI/,
      )
    } )
  } )

  it( 'ignores unrelated variables', () => {
    expect( () => loadConfig( { ...base, HOME: '/Users/x', PATH: '/usr/bin' } ) ).not.toThrow()
  } )
} )
