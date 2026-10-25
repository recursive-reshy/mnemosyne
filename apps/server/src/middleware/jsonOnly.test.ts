// Express
import express from 'express'
import type { Express } from 'express'
// Packages
import request from 'supertest'
import { describe, it, expect } from 'vitest'
// Errors
import { errorMiddleware } from '../errors.js'
// Middleware
import { jsonOnly } from './jsonOnly.js'

const buildApp = (): Express => {
  const app = express()

  app.use( express.json() )
  app.use( '/api', jsonOnly )
  app.all( '/api/thing', ( _req, res ) => {
    res.status( 200 ).json( { ok: true } )
  } )
  app.post( '/other', ( _req, res ) => {
    res.status( 200 ).json( { ok: true } )
  } )
  app.use( errorMiddleware )

  return app
}

describe( 'jsonOnly', () => {
  it.each( [ 'post', 'put', 'patch', 'delete' ] as const )(
    'refuses %s without application/json with 415',
    async ( method ) => {
      const response = await request( buildApp() )[ method ]( '/api/thing' )
        .set( 'Content-Type', 'text/plain' )
        .send( 'x' )

      expect( response.status ).toBe( 415 )
      expect( response.body ).toEqual( { error: 'Requests must be application/json' } )
    },
  )

  it( 'refuses a state-changing request with no Content-Type at all', async () => {
    const response = await request( buildApp() ).post( '/api/thing' )

    expect( response.status ).toBe( 415 )
  } )

  it( 'refuses a form post', async () => {
    const response = await request( buildApp() ).post( '/api/thing' ).type( 'form' ).send( 'a=1' )

    expect( response.status ).toBe( 415 )
  } )

  it.each( [ 'post', 'put', 'patch', 'delete' ] as const )(
    'lets %s through with application/json, with or without a charset',
    async ( method ) => {
      const plain = await request( buildApp() )[ method ]( '/api/thing' ).send( {} )
      const charset = await request( buildApp() )[ method ]( '/api/thing' )
        .set( 'Content-Type', 'Application/JSON; charset=utf-8' )
        .send( '{}' )

      expect( plain.status ).toBe( 200 )
      expect( charset.status ).toBe( 200 )
    },
  )

  it.each( [ 'get', 'head', 'options' ] as const )( 'does not check %s', async ( method ) => {
    const response = await request( buildApp() )[ method ]( '/api/thing' )

    expect( response.status ).toBe( 200 )
  } )

  it( 'only covers what is mounted under it', async () => {
    const response = await request( buildApp() ).post( '/other' )

    expect( response.status ).toBe( 200 )
  } )
} )
