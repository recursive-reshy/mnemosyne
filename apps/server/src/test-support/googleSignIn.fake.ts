// Clients
import { SignInError } from '../clients/googleSignIn.client.js'
import type { GoogleIdentity, GoogleSignInClient } from '../clients/googleSignIn.client.js'

export type FakeGoogleSignIn = GoogleSignInClient & {
  urls: { origin: string, state: string, codeChallenge: string }[]
  exchanges: { origin: string, code: string, codeVerifier: string }[]
  // What the next exchange returns; set `fail` to make it throw SignInError
  identity: GoogleIdentity
  fail: boolean
}

export const createFakeGoogleSignIn = (): FakeGoogleSignIn => {
  const fake: FakeGoogleSignIn = {
    urls: [],
    exchanges: [],
    identity: { sub: 'sub-1', email: 'admin@example.com', email_verified: true, name: 'Admin' },
    fail: false,

    buildSignInUrl: ( args ) => {
      fake.urls.push( args )

      return `https://accounts.google.test/auth?state=${ args.state }`
    },

    exchangeSignInCode: ( args ) => {
      fake.exchanges.push( args )

      return fake.fail
        ? Promise.reject( new SignInError( 'Google did not accept the sign-in code' ) )
        : Promise.resolve( fake.identity )
    },
  }

  return fake
}
