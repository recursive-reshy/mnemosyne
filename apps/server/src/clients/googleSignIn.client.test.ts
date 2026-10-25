// Packages
import {
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest'
// Clients
import {
  SignInError,
  createGoogleSignInClient,
} from './googleSignIn.client.js'

const mock = vi.hoisted( () => ( {
  constructed: [] as unknown[],
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
} ) )

vi.mock( 'google-auth-library', () => ( {
  CodeChallengeMethod: { S256: 'S256' },
  OAuth2Client: class {
    generateAuthUrl = mock.generateAuthUrl
    getToken = mock.getToken
    verifyIdToken = mock.verifyIdToken

    constructor( options: unknown ) {
      mock.constructed.push( options )
    }
  },
} ) )

const client = createGoogleSignInClient( { clientId: 'cid', clientSecret: 'csecret' } )
const origin = 'https://mac.tail1234.ts.net'

const payload = { sub: 'sub-1', email: 'me@example.com', email_verified: true, name: 'Me' }

beforeEach( () => {
  mock.constructed.length = 0
  mock.generateAuthUrl.mockReset().mockReturnValue( 'https://accounts.google.test/auth?x=1' )
  mock.getToken.mockReset().mockResolvedValue( { tokens: { id_token: 'the-id-token' } } )
  mock.verifyIdToken.mockReset().mockResolvedValue( { getPayload: () => payload } )
} )

describe( 'buildSignInUrl', () => {
  it( 'asks for the sign-in scopes with PKCE, state and an account chooser', () => {
    const url = client.buildSignInUrl( { origin, state: 'st', codeChallenge: 'chal' } )

    expect( url ).toBe( 'https://accounts.google.test/auth?x=1' )
    expect( mock.generateAuthUrl ).toHaveBeenCalledWith( {
      scope: [ 'openid', 'email', 'profile' ],
      prompt: 'select_account',
      state: 'st',
      code_challenge: 'chal',
      code_challenge_method: 'S256',
    } )
  } )

  it( 'builds the OAuth client with this origin\'s callback as the redirect URI', () => {
    client.buildSignInUrl( { origin, state: 'st', codeChallenge: 'chal' } )

    expect( mock.constructed ).toEqual( [ {
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: `${ origin }/api/auth/callback`,
    } ] )
  } )
} )

describe( 'exchangeSignInCode', () => {
  it( 'returns the verified identity', async () => {
    const identity = await client.exchangeSignInCode( {
      origin,
      code: 'the-code',
      codeVerifier: 'ver',
    } )

    expect( identity ).toEqual( payload )
    expect( mock.getToken ).toHaveBeenCalledWith( { code: 'the-code', codeVerifier: 'ver' } )
    expect( mock.verifyIdToken ).toHaveBeenCalledWith( {
      idToken: 'the-id-token',
      audience: 'cid',
    } )
    expect( mock.constructed ).toEqual( [ {
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: `${ origin }/api/auth/callback`,
    } ] )
  } )

  it( 'falls back to the email when Google sends no name', async () => {
    mock.verifyIdToken.mockResolvedValue( {
      getPayload: () => ( { ...payload, name: undefined } ),
    } )

    const identity = await client.exchangeSignInCode( { origin, code: 'c', codeVerifier: 'v' } )

    expect( identity.name ).toBe( 'me@example.com' )
  } )

  it( 'reports an unverified email as such, without failing', async () => {
    mock.verifyIdToken.mockResolvedValue( {
      getPayload: () => ( { ...payload, email_verified: undefined } ),
    } )

    const identity = await client.exchangeSignInCode( { origin, code: 'c', codeVerifier: 'v' } )

    expect( identity.email_verified ).toBe( false )
  } )

  it.each( [
    [
      'the code exchange fails',
      () => mock.getToken.mockRejectedValue( new Error( 'invalid_grant' ) ),
    ],
    [ 'no ID token comes back', () => mock.getToken.mockResolvedValue( { tokens: {} } ) ],
    [ 'verification fails', () => mock.verifyIdToken.mockRejectedValue( new Error( 'bad sig' ) ) ],
    [
      'there is no payload',
      () => mock.verifyIdToken.mockResolvedValue( { getPayload: () => undefined } ),
    ],
    [ 'the payload has no sub', () => mock.verifyIdToken.mockResolvedValue( {
      getPayload: () => ( { ...payload, sub: undefined } ),
    } ) ],
    [ 'the payload has no email', () => mock.verifyIdToken.mockResolvedValue( {
      getPayload: () => ( { ...payload, email: undefined } ),
    } ) ],
  ] )( 'throws SignInError when %s', async ( _name, arrange ) => {
    arrange()

    await expect( client.exchangeSignInCode( { origin, code: 'c', codeVerifier: 'v' } ) )
      .rejects.toBeInstanceOf( SignInError )
  } )

  it( 'keeps tokens, codes and emails out of the error message', async () => {
    mock.getToken.mockRejectedValue( new Error( 'the-code me@example.com the-id-token' ) )

    const error = await client.exchangeSignInCode( {
      origin,
      code: 'the-code',
      codeVerifier: 'ver',
    } ).then( () => new Error( 'did not throw' ), ( caught: unknown ) => caught as Error )

    expect( error.message ).not.toMatch( /the-code|me@example.com|the-id-token|ver\b/ )
  } )
} )
