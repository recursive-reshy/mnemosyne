// Node
import { randomBytes } from 'node:crypto'
// Packages
import { auth, gmail } from '@googleapis/gmail'
import type { gmail_v1 } from '@googleapis/gmail'
// Config
import { config } from '../config.js'
// Repositories
import {
  deleteAccount,
  findAccount,
  saveAccount,
  setAccountStatus,
} from '../repositories/gmailAccount.repository.js'
import type { StoredGmailAccount } from '../repositories/gmailAccount.repository.js'
// Gmail
import { TokenDecryptError, decryptToken, encryptToken } from './tokenCipher.js'

export const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

const STATE_TTL_MS = 10 * 60 * 1000
const MAX_STATES = 20
const UNREADABLE_REASON = 'The stored Gmail access can\'t be read; reconnect'
const REVOKED_REASON = 'Google no longer accepts Mnemosyne\'s access '
  + '(revoked, expired, or the app is in Testing)'

export class GmailNotConfiguredError extends Error {
  constructor() {
    super( 'Gmail isn\'t configured' )
    this.name = 'GmailNotConfiguredError'
  }
}

export class GmailNotConnectedError extends Error {
  constructor( message = 'Gmail isn\'t connected' ) {
    super( message )
    this.name = 'GmailNotConnectedError'
  }
}

export class GmailAuthError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'GmailAuthError'
  }
}

export class OAuthStateError extends Error {
  constructor() {
    super( 'The Gmail consent request is unknown or has expired' )
    this.name = 'OAuthStateError'
  }
}

export class MissingRefreshTokenError extends Error {
  constructor() {
    super( 'Google did not return a refresh token' )
    this.name = 'MissingRefreshTokenError'
  }
}

export class MissingScopeError extends Error {
  constructor() {
    super( 'Google did not grant read-only Gmail access' )
    this.name = 'MissingScopeError'
  }
}

type GmailConfig = NonNullable< typeof config.gmail >
type OAuthClient = InstanceType< typeof auth.OAuth2 >

const states = new Map< string, number >()
let cached: { key: string, client: gmail_v1.Gmail } | null = null

const requireConfig = (): GmailConfig => {
  if( config.gmail === null ) {
    throw new GmailNotConfiguredError()
  }

  return config.gmail
}

const buildOAuthClient = ( { clientId, clientSecret, redirectUri }: GmailConfig ): OAuthClient => {
  return new auth.OAuth2( clientId, clientSecret, redirectUri )
}

export const createConsentUrl = (): string => {
  const oauth = buildOAuthClient( requireConfig() )
  const state = randomBytes( 32 ).toString( 'hex' )

  states.set( state, Date.now() + STATE_TTL_MS )

  while( states.size > MAX_STATES ) {
    states.delete( states.keys().next().value! )
  }

  return oauth.generateAuthUrl( {
    access_type: 'offline',
    prompt: 'consent',
    scope: [ SCOPE ],
    state,
    include_granted_scopes: false,
  } )
}

const consumeState = ( state: string ): void => {
  const expiresAt = states.get( state )

  states.delete( state )

  if( expiresAt === undefined || expiresAt < Date.now() ) {
    throw new OAuthStateError()
  }
}

export const completeConsent = async (
  { code, state }: { code: string, state: string },
): Promise< void > => {
  const settings = requireConfig()

  consumeState( state )

  const oauth = buildOAuthClient( settings )
  const { tokens } = await oauth.getToken( code )

  if( !tokens.refresh_token ) {
    throw new MissingRefreshTokenError()
  }

  if( !( tokens.scope ?? '' ).split( ' ' ).includes( SCOPE ) ) {
    throw new MissingScopeError()
  }

  oauth.setCredentials( tokens )

  const { data } = await gmail( { version: 'v1', auth: oauth } ).users.getProfile( {
    userId: 'me',
  } )

  saveAccount( {
    email: data.emailAddress ?? '',
    refresh_token_enc: encryptToken( tokens.refresh_token, settings.encryptionKey ),
    scope: SCOPE,
    status: 'connected',
    error: null,
    connected_at: new Date().toISOString(),
  } )
  cached = null
}

const readToken = ( account: StoredGmailAccount, settings: GmailConfig ): string => {
  try {
    return decryptToken( account.refresh_token_enc, settings.encryptionKey )
  } catch( error ) {
    if( !( error instanceof TokenDecryptError ) ) {
      throw error
    }

    console.error( 'Gmail: the stored refresh token could not be decrypted' )
    setAccountStatus( 'reconnect_needed', UNREADABLE_REASON )
    throw new GmailNotConnectedError( UNREADABLE_REASON )
  }
}

export const getGmailClient = (): gmail_v1.Gmail => {
  const settings = requireConfig()
  const account = findAccount()

  if( account === undefined ) {
    throw new GmailNotConnectedError()
  }

  if( account.status === 'reconnect_needed' ) {
    throw new GmailAuthError( account.error ?? REVOKED_REASON )
  }

  if( cached?.key === account.refresh_token_enc ) {
    return cached.client
  }

  const oauth = buildOAuthClient( settings )

  oauth.setCredentials( { refresh_token: readToken( account, settings ) } )
  cached = { key: account.refresh_token_enc, client: gmail( { version: 'v1', auth: oauth } ) }

  return cached.client
}

const isAuthFailure = ( error: unknown ): boolean => {
  if( typeof error !== 'object' || error === null ) {
    return false
  }

  const { code, status, response, message } = error as {
    code?: unknown
    status?: unknown
    message?: unknown
    response?: { status?: unknown, data?: { error?: unknown } }
  }

  return code === 401
    || status === 401
    || response?.status === 401
    || response?.data?.error === 'invalid_grant'
    || ( typeof message === 'string' && message.includes( 'invalid_grant' ) )
}

export const withGmail = async < T >(
  run: ( client: gmail_v1.Gmail ) => Promise< T >,
): Promise< T > => {
  const client = getGmailClient()

  try {
    return await run( client )
  } catch( error ) {
    if( !isAuthFailure( error ) ) {
      throw error
    }

    console.warn( 'Gmail: Google rejected the stored access' )
    setAccountStatus( 'reconnect_needed', REVOKED_REASON )
    cached = null
    throw new GmailAuthError( REVOKED_REASON )
  }
}

export const disconnect = async (): Promise< void > => {
  const settings = requireConfig()
  const account = findAccount()

  if( account === undefined ) {
    return
  }

  try {
    await buildOAuthClient( settings )
      .revokeToken( decryptToken( account.refresh_token_enc, settings.encryptionKey ) )
  } catch{
    console.warn( 'Gmail: revoking the token at Google failed; deleting it locally' )
  }

  deleteAccount()
  cached = null
}
