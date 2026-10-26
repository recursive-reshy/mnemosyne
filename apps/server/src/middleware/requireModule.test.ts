// Express
import express from 'express'
import type { Express } from 'express'
// Packages
import {
  describe,
  it,
  expect,
} from 'vitest'
import supertest from 'supertest'
// Errors
import { errorMiddleware, notFoundHandler } from '../errors.js'
// Middleware
import { requireUser } from './auth.js'
import { requireModule } from './requireModule.js'
// Test support
import '../test-support/database.setup.js'
import { cookieFor, createTestUser } from '../test-support/auth.js'

const buildApp = (): Express => {
  const app = express()

  app.use( '/api', requireUser )
  app.use( '/api/transcribe', requireModule( 'transcriber' ) )
  app.use( '/api/study', requireModule( 'melete' ) )
  app.get( '/api/transcribe/ping', ( _req, res ) => {
    res.status( 200 ).json( { ok: 'transcriber' } )
  } )
  app.get( '/api/study/ping', ( _req, res ) => {
    res.status( 200 ).json( { ok: 'melete' } )
  } )
  app.get( '/api/shared/ping', ( _req, res ) => {
    res.status( 200 ).json( { ok: 'shared' } )
  } )
  app.use( '/api', notFoundHandler )
  app.use( errorMiddleware )

  return app
}

const get = async ( user: ReturnType< typeof createTestUser >, path: string ) => {
  return supertest( buildApp() ).get( path ).set( 'Cookie', cookieFor( user ) )
}

describe( 'requireModule', () => {
  it( 'lets a user with the module through', async () => {
    const user = createTestUser( { modules: [ 'transcriber' ] } )

    expect( ( await get( user, '/api/transcribe/ping' ) ).body ).toEqual( { ok: 'transcriber' } )
  } )

  it( 'answers 404, like an unknown route, to a user without the module', async () => {
    const user = createTestUser( { modules: [ 'melete' ] } )

    const gated = await get( user, '/api/transcribe/ping' )
    const unknown = await get( user, '/api/nowhere' )

    expect( gated.status ).toBe( 404 )
    expect( gated.body ).toEqual( unknown.body )
  } )

  it( 'gates each module on its own', async () => {
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } )
    const melete = createTestUser( { modules: [ 'melete' ] } )

    expect( ( await get( transcriber, '/api/study/ping' ) ).status ).toBe( 404 )
    expect( ( await get( melete, '/api/study/ping' ) ).status ).toBe( 200 )
    expect( ( await get( melete, '/api/transcribe/ping' ) ).status ).toBe( 404 )
  } )

  it( 'refuses a member with no modules at all, but not the shared routes', async () => {
    const user = createTestUser( { modules: [] } )

    expect( ( await get( user, '/api/transcribe/ping' ) ).status ).toBe( 404 )
    expect( ( await get( user, '/api/study/ping' ) ).status ).toBe( 404 )
    expect( ( await get( user, '/api/shared/ping' ) ).status ).toBe( 200 )
  } )

  it( 'always lets the admin through, whatever modules are stored for them', async () => {
    const admin = createTestUser( { role: 'admin' } )

    expect( ( await get( admin, '/api/transcribe/ping' ) ).status ).toBe( 200 )
    expect( ( await get( admin, '/api/study/ping' ) ).status ).toBe( 200 )
  } )
} )
