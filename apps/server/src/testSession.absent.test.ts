// Packages
import request from 'supertest'
import { describe, it, expect } from 'vitest'
// App
import { app } from './app.js'
// Config
import { config } from './config.js'
// Test support
import { signedInRequest } from './test-support/auth.js'

describe( 'the test sign-in route', () => {
  it( 'is off unless E2E_TEST_SIGNIN is set', () => {
    expect( config.e2eTestSignin ).toBe( false )
  } )

  it( 'does not exist in the app: a 404, and no session is made', async () => {
    const res = await signedInRequest( app )
      .post( '/api/test/session' )
      .send( { email: 'someone@example.com' } )

    expect( res.status ).toBe( 404 )
    expect( res.get( 'Set-Cookie' ) ).toBeUndefined()
  } )

  it( 'is 401 without a session, so it cannot be used to get one', async () => {
    const res = await request( app )
      .post( '/api/test/session' )
      .set( 'Content-Type', 'application/json' )
      .send( { email: config.adminEmail } )

    expect( res.status ).toBe( 401 )
  } )
} )
