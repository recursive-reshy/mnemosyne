// Packages
import { describe, it, expect } from 'vitest'
import request from 'supertest'
// App
import { app } from './app.js'

describe( 'unknown /api routes', () => {
  it( 'responds 404 for a path that does not exist', async () => {
    const response = await request( app ).get( '/api/does-not-exist' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Not Found' } )
  } )

  it( 'responds 404 for the wrong method on a known path', async () => {
    const response = await request( app ).post( '/api/health' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Not Found' } )
  } )
} )
