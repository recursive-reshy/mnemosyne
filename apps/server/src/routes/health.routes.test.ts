// Packages
import { describe, it, expect } from 'vitest'
import request from 'supertest'
// App
import { app } from '../app.js'

describe( 'GET /api/health', () => {
  it( 'responds 200', async () => {
    const response = await request( app ).get( '/api/health' )

    expect( response.status ).toBe( 200 )
  } )

  it( 'responds with JSON', async () => {
    const response = await request( app ).get( '/api/health' )

    expect( response.headers[ 'content-type' ] ).toMatch( /application\/json/ )
  } )

  it( 'responds with exactly { status: "ok" }', async () => {
    const response = await request( app ).get( '/api/health' )

    expect( response.body ).toEqual( { status: 'ok' } )
  } )
} )
