// Packages
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'

export type GoogleIdentity = {
  sub: string
  email: string
  email_verified: boolean
  name: string
}

export type GoogleSignInClient = {
  buildSignInUrl: ( args: { origin: string, state: string, codeChallenge: string } ) => string
  exchangeSignInCode: (
    args: { origin: string, code: string, codeVerifier: string },
  ) => Promise< GoogleIdentity >
}

// Messages are fixed text: the cause may hold a code, a token or an email, so it is not kept
export class SignInError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'SignInError'
  }
}

export const createGoogleSignInClient = (
  { clientId, clientSecret }: { clientId: string, clientSecret: string },
): GoogleSignInClient => {
  // The redirect URI belongs to the origin the person came to, so each call builds its own client
  const oauthClient = ( origin: string ): OAuth2Client => new OAuth2Client( {
    clientId,
    clientSecret,
    redirectUri: `${ origin }/api/auth/callback`,
  } )

  return {
    buildSignInUrl: ( { origin, state, codeChallenge } ) => {
      return oauthClient( origin ).generateAuthUrl( {
        scope: [ 'openid', 'email', 'profile' ],
        prompt: 'select_account',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      } )
    },

    exchangeSignInCode: async ( { origin, code, codeVerifier } ) => {
      const oauth = oauthClient( origin )
      let idToken: string | null | undefined

      try {
        const { tokens } = await oauth.getToken( { code, codeVerifier } )

        idToken = tokens.id_token
      } catch{
        throw new SignInError( 'Google did not accept the sign-in code' )
      }

      if( typeof idToken !== 'string' || idToken === '' ) {
        throw new SignInError( 'Google sent no ID token' )
      }

      let payload
      try {
        const ticket = await oauth.verifyIdToken( { idToken, audience: clientId } )

        payload = ticket.getPayload()
      } catch{
        throw new SignInError( 'The ID token could not be verified' )
      }

      if( payload?.sub === undefined || payload.email === undefined ) {
        throw new SignInError( 'The ID token has no subject or email' )
      }

      return {
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified === true,
        name: payload.name ?? payload.email,
      }
    },
  }
}
