// Packages
import { describe, it, expect } from 'vitest'
// Test support
import { createTestUser } from '../test-support/auth.js'
// Repositories
import { updateUser } from '../repositories/users.repository.js'
// Services
import { interimOwnerId } from './interimOwner.js'

describe( 'interimOwnerId', () => {
  it( 'throws when there is no admin', () => {
    createTestUser()

    expect( () => interimOwnerId() ).toThrow( 'There is no admin to act for' )
  } )

  it( 'is the active admin, not a member', () => {
    createTestUser()

    const admin = createTestUser( { role: 'admin' } )

    expect( interimOwnerId() ).toBe( admin.id )
  } )

  it( 'ignores a removed admin', () => {
    const admin = createTestUser( { role: 'admin' } )

    updateUser( admin.id, { status: 'removed' } )

    expect( () => interimOwnerId() ).toThrow( 'There is no admin to act for' )
  } )
} )
