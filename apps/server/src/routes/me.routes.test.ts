// Packages
import request from 'supertest'
import { describe, it, expect } from 'vitest'
// Shared
import { Me } from '@mnemosyne/shared'
// App
import { app } from '../app.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

describe( 'GET /api/me', () => {
  it( 'is 401 without a session', async () => {
    const response = await request( app ).get( '/api/me' )

    expect( response.status ).toBe( 401 )
    expect( response.body ).toEqual( { error: 'unauthenticated' } )
  } )

  it( 'gives the admin every module', async () => {
    const admin = createTestUser( { role: 'admin', email: 'boss@example.com' } )
    const response = await signedInRequest( app, admin ).get( '/api/me' )

    expect( response.status ).toBe( 200 )
    expect( Me.parse( response.body ) ).toMatchObject( {
      id: admin.id,
      email: 'boss@example.com',
      role: 'admin',
      modules: [ 'transcriber', 'melete' ],
      vault_dir: null,
    } )
  } )

  it( 'gives a member their modules and vault', async () => {
    const member = createTestUser( { modules: [ 'melete' ], vault_dir: 'brother' } )
    const response = await signedInRequest( app, member ).get( '/api/me' )

    expect( Me.parse( response.body ) ).toMatchObject( {
      id: member.id,
      role: 'member',
      name: 'Test member',
      modules: [ 'melete' ],
      vault_dir: 'brother',
    } )
  } )

  it( 'gives a member with no modules an empty list', async () => {
    const member = createTestUser( { modules: [] } )
    const response = await signedInRequest( app, member ).get( '/api/me' )

    expect( Me.parse( response.body ).modules ).toEqual( [] )
  } )
} )
