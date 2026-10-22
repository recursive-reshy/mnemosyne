// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import type { MockInstance } from 'vitest'
// Gmail
import {
  GmailAuthError,
  GmailNotConfiguredError,
  GmailNotConnectedError,
  MissingRefreshTokenError,
  MissingScopeError,
  OAuthStateError,
  SCOPE,
  completeConsent,
  createConsentUrl,
  disconnect,
  getGmailClient,
  withGmail,
} from './auth.js'
import { decryptToken, encryptToken } from './tokenCipher.js'
// Repositories
import {
  findAccount,
  saveAccount,
  setAccountStatus,
} from '../repositories/gmailAccount.repository.js'
import { getHealth } from '../repositories/health.repository.js'
// Logging
import { logger } from '../logger.js'

const key = Buffer.alloc( 32, 3 )
const refreshToken = '1//0g-secret-refresh-token'
const authCode = '4/0A-secret-auth-code'

const mocks = vi.hoisted( () => ( {
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  setCredentials: vi.fn(),
  revokeToken: vi.fn(),
  getProfile: vi.fn(),
  oauthInstances: [] as unknown[],
  gmailInstances: [] as unknown[],
} ) )

vi.mock( '@googleapis/gmail', () => {
  class MockOAuth2 {
    clientId: string
    clientSecret: string
    redirectUri: string

    constructor( clientId: string, clientSecret: string, redirectUri: string ) {
      this.clientId = clientId
      this.clientSecret = clientSecret
      this.redirectUri = redirectUri
      mocks.oauthInstances.push( this )
    }

    generateAuthUrl = mocks.generateAuthUrl
    getToken = mocks.getToken
    setCredentials = mocks.setCredentials
    revokeToken = mocks.revokeToken
  }

  return {
    auth: { OAuth2: MockOAuth2 },
    gmail: vi.fn( ( options: unknown ) => {
      const client = { users: { getProfile: mocks.getProfile }, options }

      mocks.gmailInstances.push( client )
      return client
    } ),
  }
} )

const configMock = vi.hoisted( () => {
  const mock: { gmail: Record< string, unknown > | null, logLevel: string } = {
    gmail: null,
    logLevel: 'silent',
  }

  return mock
} )

vi.mock( '../config.js', () => ( { config: configMock } ) )

const gmailConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3100/api/gmail/oauth/callback',
  encryptionKey: key,
}

const connectAccount = (): void => {
  saveAccount( {
    email: 'naresh@example.com',
    refresh_token_enc: encryptToken( refreshToken, key ),
    scope: SCOPE,
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
  } )
}

const stateFromLastUrl = (): string => {
  const [ options ] = mocks.generateAuthUrl.mock.calls.at( -1 )! as [ { state: string } ]

  return options.state
}

const grantOnce = ( tokens: Record< string, unknown > ): void => {
  mocks.getToken.mockResolvedValueOnce( { tokens } )
  mocks.getProfile.mockResolvedValue( { data: { emailAddress: 'naresh@example.com' } } )
}

type LogSpy = MockInstance< ( ...args: unknown[] ) => void >

const logSpies = (): LogSpy[] => {
  return ( [ 'info', 'warn', 'error', 'debug' ] as const )
    .map( ( method ) => vi.spyOn( logger, method ).mockImplementation( () => undefined ) )
}

const logged = ( spies: LogSpy[] ): string => {
  return JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) )
}

beforeEach( () => {
  vi.resetAllMocks()
  mocks.oauthInstances.length = 0
  mocks.gmailInstances.length = 0
  mocks.generateAuthUrl.mockReturnValue( 'https://accounts.google.com/consent' )
  configMock.gmail = gmailConfig
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'createConsentUrl', () => {
  it( 'asks for offline, read-only access with a 64-hex state', () => {
    expect( createConsentUrl() ).toBe( 'https://accounts.google.com/consent' )

    expect( mocks.generateAuthUrl ).toHaveBeenCalledWith( {
      access_type: 'offline',
      prompt: 'consent',
      scope: [ SCOPE ],
      state: expect.stringMatching( /^[0-9a-f]{64}$/ ) as string,
      include_granted_scopes: false,
    } )
    expect( SCOPE ).toBe( 'https://www.googleapis.com/auth/gmail.readonly' )
  } )

  it( 'builds the OAuth client from the config', () => {
    createConsentUrl()

    expect( mocks.oauthInstances[ 0 ] ).toMatchObject( {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: gmailConfig.redirectUri,
    } )
  } )

  it( 'gives each call its own state', () => {
    createConsentUrl()
    const first = stateFromLastUrl()

    createConsentUrl()

    expect( stateFromLastUrl() ).not.toBe( first )
  } )

  it( 'throws when Gmail is not configured', () => {
    configMock.gmail = null

    expect( () => createConsentUrl() ).toThrow( GmailNotConfiguredError )
  } )
} )

describe( 'completeConsent', () => {
  it( 'saves the account with an encrypted refresh token', async () => {
    vi.useFakeTimers( { now: new Date( '2026-10-19T10:00:00.000Z' ) } )
    createConsentUrl()
    grantOnce( { refresh_token: refreshToken, scope: `openid ${ SCOPE }` } )

    await completeConsent( { code: authCode, state: stateFromLastUrl() } )

    const account = findAccount()

    expect( mocks.getToken ).toHaveBeenCalledWith( authCode )
    expect( account ).toMatchObject( {
      email: 'naresh@example.com',
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )
    expect( account?.refresh_token_enc ).not.toContain( refreshToken )
    expect( decryptToken( account?.refresh_token_enc ?? '', key ) ).toBe( refreshToken )
  } )

  it( 'clears an earlier connection failure when consent completes', async () => {
    connectAccount()
    await expect( withGmail( () => Promise.reject(
      Object.assign( new Error( 'Unauthorized' ), { code: 401 } ),
    ) ) ).rejects.toThrow( GmailAuthError )

    createConsentUrl()
    grantOnce( { refresh_token: refreshToken, scope: SCOPE } )
    await completeConsent( { code: authCode, state: stateFromLastUrl() } )

    expect( getHealth( 'gmail_connection', 'default' ) ).toMatchObject( {
      last_error: null,
      failing_since: null,
    } )
  } )

  it( 'replaces an account that needed a reconnect', async () => {
    connectAccount()
    setAccountStatus( 'reconnect_needed', 'revoked' )
    createConsentUrl()
    grantOnce( { refresh_token: 'new-token', scope: SCOPE } )

    await completeConsent( { code: authCode, state: stateFromLastUrl() } )

    expect( findAccount() ).toMatchObject( { status: 'connected', error: null } )
  } )

  it( 'refuses an unknown state', async () => {
    await expect( completeConsent( { code: authCode, state: 'f'.repeat( 64 ) } ) )
      .rejects.toThrow( OAuthStateError )
    expect( mocks.getToken ).not.toHaveBeenCalled()
  } )

  it( 'refuses a state after ten minutes', async () => {
    vi.useFakeTimers()
    createConsentUrl()
    const state = stateFromLastUrl()

    vi.advanceTimersByTime( 10 * 60 * 1000 + 1 )

    await expect( completeConsent( { code: authCode, state } ) ).rejects.toThrow( OAuthStateError )
  } )

  it( 'accepts a state just inside the ten minutes', async () => {
    vi.useFakeTimers()
    createConsentUrl()
    grantOnce( { refresh_token: refreshToken, scope: SCOPE } )
    const state = stateFromLastUrl()

    vi.advanceTimersByTime( 10 * 60 * 1000 - 1 )

    await expect( completeConsent( { code: authCode, state } ) ).resolves.toBeUndefined()
  } )

  it( 'consumes the state on first use, even when consent fails', async () => {
    createConsentUrl()
    const state = stateFromLastUrl()

    mocks.getToken.mockResolvedValueOnce( { tokens: { scope: SCOPE } } )
    await expect( completeConsent( { code: authCode, state } ) )
      .rejects.toThrow( MissingRefreshTokenError )

    grantOnce( { refresh_token: refreshToken, scope: SCOPE } )
    await expect( completeConsent( { code: authCode, state } ) ).rejects.toThrow( OAuthStateError )
  } )

  it( 'drops the oldest state beyond twenty outstanding', async () => {
    createConsentUrl()
    const oldest = stateFromLastUrl()

    for( let count = 0; count < 20; count++ ) {
      createConsentUrl()
    }

    await expect( completeConsent( { code: authCode, state: oldest } ) )
      .rejects.toThrow( OAuthStateError )
    expect( stateFromLastUrl() ).not.toBe( oldest )
  } )

  it( 'refuses a grant with no refresh token', async () => {
    createConsentUrl()
    grantOnce( { scope: SCOPE } )

    await expect( completeConsent( { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow( MissingRefreshTokenError )
    expect( findAccount() ).toBeUndefined()
  } )

  it( 'refuses a grant without the read-only scope', async () => {
    createConsentUrl()
    grantOnce( { refresh_token: refreshToken, scope: 'openid email' } )

    await expect( completeConsent( { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow( MissingScopeError )
    expect( findAccount() ).toBeUndefined()
  } )
} )

describe( 'getGmailClient', () => {
  it( 'throws GmailNotConnectedError with no account', () => {
    expect( () => getGmailClient() ).toThrow( GmailNotConnectedError )
  } )

  it( 'throws GmailNotConfiguredError when Gmail is not configured', () => {
    configMock.gmail = null

    expect( () => getGmailClient() ).toThrow( GmailNotConfiguredError )
  } )

  it( 'builds a client on the decrypted refresh token', () => {
    connectAccount()

    const client = getGmailClient()

    expect( client ).toBe( mocks.gmailInstances[ 0 ] )
    expect( mocks.setCredentials ).toHaveBeenCalledWith( { refresh_token: refreshToken } )
  } )

  it( 'reuses the client until the account row changes', () => {
    connectAccount()
    const first = getGmailClient()

    expect( getGmailClient() ).toBe( first )

    saveAccount( { ...findAccount()!, refresh_token_enc: encryptToken( 'other', key ) } )

    expect( getGmailClient() ).not.toBe( first )
    expect( mocks.gmailInstances ).toHaveLength( 2 )
  } )

  it( 'marks the account reconnect_needed when the token cannot be decrypted', () => {
    const spies = logSpies()

    saveAccount( {
      email: 'naresh@example.com',
      refresh_token_enc: encryptToken( refreshToken, Buffer.alloc( 32, 9 ) ),
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )

    expect( () => getGmailClient() ).toThrow( GmailNotConnectedError )
    expect( findAccount() ).toMatchObject( {
      status: 'reconnect_needed',
      error: 'The stored Gmail access can\'t be read; reconnect',
    } )
    expect( logged( spies ) ).not.toContain( refreshToken )
  } )

  it( 'records the connection as failing when the token cannot be decrypted', () => {
    saveAccount( {
      email: 'naresh@example.com',
      refresh_token_enc: encryptToken( refreshToken, Buffer.alloc( 32, 9 ) ),
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )

    expect( () => getGmailClient() ).toThrow( GmailNotConnectedError )
    expect( getHealth( 'gmail_connection', 'default' )?.last_error )
      .toBe( 'The stored Gmail access can\'t be read; reconnect' )
  } )

  it( 'throws GmailAuthError while the account needs a reconnect', () => {
    connectAccount()
    setAccountStatus( 'reconnect_needed', 'revoked' )

    expect( () => getGmailClient() ).toThrow( GmailAuthError )
  } )
} )

describe( 'withGmail', () => {
  const reason = 'Google no longer accepts Mnemosyne\'s access '
    + '(revoked, expired, or the app is in Testing)'

  it( 'passes the client to the function and returns its result', async () => {
    connectAccount()

    const result = await withGmail( ( client ) => Promise.resolve( client ) )

    expect( result ).toBe( mocks.gmailInstances[ 0 ] )
  } )

  it.each( [
    [
      'invalid_grant in the response',
      Object.assign( new Error( 'failed' ), { response: { data: { error: 'invalid_grant' } } } ),
    ],
    [ 'invalid_grant in the message', new Error( 'invalid_grant: Token has been expired' ) ],
    [ 'a 401 code', Object.assign( new Error( 'Unauthorized' ), { code: 401 } ) ],
    [
      'a 401 response status',
      Object.assign( new Error( 'Unauthorized' ), { response: { status: 401 } } ),
    ],
  ] )( 'turns %s into GmailAuthError and reconnect_needed', async ( _name, failure ) => {
    const spies = logSpies()

    connectAccount()

    await expect( withGmail( () => Promise.reject( failure ) ) ).rejects.toThrow( GmailAuthError )
    expect( findAccount() ).toMatchObject( { status: 'reconnect_needed', error: reason } )
    expect( logged( spies ) ).not.toContain( refreshToken )
  } )

  it( 'records the connection as ok after a call that works', async () => {
    connectAccount()

    await withGmail( () => Promise.resolve( 'fine' ) )

    expect( getHealth( 'gmail_connection', 'default' ) ).toMatchObject( { last_error: null } )
    expect( getHealth( 'gmail_connection', 'default' )?.last_success_at ).not.toBeNull()
  } )

  it( 'records the connection as failing when Google rejects the access', async () => {
    connectAccount()

    await expect( withGmail( () => Promise.reject(
      Object.assign( new Error( 'Unauthorized' ), { code: 401 } ),
    ) ) ).rejects.toThrow( GmailAuthError )

    expect( getHealth( 'gmail_connection', 'default' )?.last_error ).toBe( reason )
  } )

  it( 'does not touch the connection health on another kind of error', async () => {
    connectAccount()

    await expect( withGmail( () => Promise.reject(
      Object.assign( new Error( 'Backend Error' ), { code: 500 } ),
    ) ) ).rejects.toThrow( 'Backend Error' )

    expect( getHealth( 'gmail_connection', 'default' ) ).toBeUndefined()
  } )

  it( 'passes other errors through and leaves the status alone', async () => {
    connectAccount()
    const failure = Object.assign( new Error( 'Backend Error' ), { code: 500 } )

    await expect( withGmail( () => Promise.reject( failure ) ) ).rejects.toBe( failure )
    expect( findAccount()?.status ).toBe( 'connected' )
  } )
} )

describe( 'disconnect', () => {
  it( 'revokes the token, deletes the account and drops the cached client', async () => {
    connectAccount()
    const first = getGmailClient()

    await disconnect()

    expect( mocks.revokeToken ).toHaveBeenCalledWith( refreshToken )
    expect( findAccount() ).toBeUndefined()

    connectAccount()

    expect( getGmailClient() ).not.toBe( first )
  } )

  it( 'removes the connection health row', async () => {
    connectAccount()
    await withGmail( () => Promise.resolve( 'fine' ) )

    await disconnect()

    expect( getHealth( 'gmail_connection', 'default' ) ).toBeUndefined()
  } )

  it( 'still deletes the account when the revoke fails, without logging the token', async () => {
    const spies = logSpies()

    connectAccount()
    mocks.revokeToken.mockRejectedValueOnce(
      new Error( `Request failed: token=${ refreshToken } Authorization: Bearer ya29.abc` ),
    )

    await disconnect()

    expect( findAccount() ).toBeUndefined()
    expect( spies.some( ( spy ) => spy.mock.calls.length > 0 ) ).toBe( true )
    expect( logged( spies ) ).not.toContain( refreshToken )
    expect( logged( spies ) ).not.toContain( 'Bearer' )
  } )

  it( 'deletes the account even when the token cannot be decrypted', async () => {
    saveAccount( {
      email: 'naresh@example.com',
      refresh_token_enc: 'v1:garbage',
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )

    await disconnect()

    expect( mocks.revokeToken ).not.toHaveBeenCalled()
    expect( findAccount() ).toBeUndefined()
  } )

  it( 'does nothing with no account', async () => {
    await expect( disconnect() ).resolves.toBeUndefined()
    expect( mocks.revokeToken ).not.toHaveBeenCalled()
  } )
} )

describe( 'logging', () => {
  it( 'never logs the authorization code on a failed consent', async () => {
    const spies = logSpies()

    createConsentUrl()
    mocks.getToken.mockRejectedValueOnce( new Error( `bad code ${ authCode }` ) )

    await expect( completeConsent( { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow()
    expect( logged( spies ) ).not.toContain( authCode )
  } )
} )
