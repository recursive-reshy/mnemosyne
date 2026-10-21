// Express
import express, { Router } from 'express'
import type { Express } from 'express'
// Packages
import request from 'supertest'
import { describe, it, expect } from 'vitest'
// Logging
import { createLogger } from '../logger.js'
// Middleware
import { createRequestLog } from './requestLog.js'

type Line = Record< string, unknown >

const build = (): { app: Express, lines: () => Line[] } => {
  const chunks: string[] = []
  const log = createLogger( { write: ( chunk: string ) => void chunks.push( chunk ) }, 'info' )
  const app = express()
  const api = Router()

  app.use( '/api', createRequestLog( log ) )
  app.use( express.json() )
  api.get( '/jobs/:id', ( _req, res ) => void res.json( { ok: true } ) )
  api.get( '/health', ( _req, res ) => void res.json( { ok: true } ) )
  api.get( '/status', ( _req, res ) => void res.json( { ok: true } ) )
  api.post( '/broken', ( _req, res ) => void res.status( 500 ).json( {} ) )
  api.post( '/invalid', ( _req, res ) => void res.status( 400 ).json( {} ) )
  app.use( '/api', api )

  return { app, lines: () => chunks.map( ( chunk ) => JSON.parse( chunk ) as Line ) }
}

describe( 'requestLog', () => {
  it( 'logs method, route pattern, status and duration when the response finishes', async () => {
    const { app, lines } = build()

    await request( app ).get( '/api/jobs/abc-123' )

    expect( lines() ).toHaveLength( 1 )
    expect( lines()[ 0 ] ).toMatchObject( {
      level: 'info',
      msg: 'Request',
      method: 'GET',
      route: '/api/jobs/:id',
      status: 200,
      duration_ms: expect.any( Number ) as number,
    } )
  } )

  it( 'falls back to the path for a request no route matched', async () => {
    const { app, lines } = build()

    await request( app ).get( '/api/nowhere/at/all' )

    expect( lines()[ 0 ] ).toMatchObject( { route: '/api/nowhere/at/all', status: 404 } )
  } )

  it( 'logs at info below 500, and at error from 500', async () => {
    const { app, lines } = build()

    await request( app ).post( '/api/invalid' )
    await request( app ).post( '/api/broken' )

    expect( lines().map( ( line ) => [ line.status, line.level ] ) )
      .toEqual( [ [ 400, 'info' ], [ 500, 'error' ] ] )
  } )

  it( 'skips the health and status endpoints', async () => {
    const { app, lines } = build()

    await request( app ).get( '/api/health' )
    await request( app ).get( '/api/status' )

    expect( lines() ).toEqual( [] )
  } )

  it( 'never logs a body, a query string or a header', async () => {
    const { app, lines } = build()

    await request( app )
      .post( '/api/invalid?token=query-sentinel' )
      .set( 'Authorization', 'Bearer header-sentinel' )
      .send( { note: 'body-sentinel' } )

    const written = JSON.stringify( lines() )

    expect( written ).toContain( '/api/invalid' )

    for( const forbidden of [ 'query-sentinel', 'header-sentinel', 'body-sentinel' ] ) {
      expect( written ).not.toContain( forbidden )
    }
  } )
} )
