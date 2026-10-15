// Packages
import request from 'supertest'
import { describe, it, expect } from 'vitest'
// App
import { app } from './app.js'

describe( 'app without WEB_DIR', () => {
  it( 'returns 404 for /', async () => {
    const response = await request( app ).get( '/' )

    expect( response.status ).toBe( 404 )
  } )
} )
