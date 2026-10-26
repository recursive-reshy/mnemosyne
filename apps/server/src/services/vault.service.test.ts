// Node
import { join } from 'node:path'
// Packages
import { describe, it, expect } from 'vitest'
// Config
import { config } from '../config.js'
// Errors
import { NotFoundError, VaultNotChosenError } from '../errors.js'
// Test support
import { createTestUser } from '../test-support/auth.js'
// Services
import { vaultRootFor } from './vault.service.js'

describe( 'vaultRootFor', () => {
  it( 'is the user\'s folder under the vaults root', () => {
    const user = createTestUser( { vault_dir: 'naresh' } )

    expect( vaultRootFor( user.id ) ).toBe( join( config.vaultsPath, 'naresh' ) )
  } )

  it( 'gives two users two different roots', () => {
    const first = createTestUser( { vault_dir: 'naresh' } )
    const second = createTestUser( { vault_dir: 'brother' } )

    expect( vaultRootFor( first.id ) ).not.toBe( vaultRootFor( second.id ) )
    expect( vaultRootFor( second.id ) ).toBe( join( config.vaultsPath, 'brother' ) )
  } )

  it( 'throws VaultNotChosenError for a user without a vault', () => {
    const user = createTestUser()

    expect( () => vaultRootFor( user.id ) ).toThrow( VaultNotChosenError )
    expect( () => vaultRootFor( user.id ) ).toThrow( 'Choose your vault first' )
  } )

  it( 'throws NotFoundError for an unknown user', () => {
    expect( () => vaultRootFor( 'nobody' ) ).toThrow( NotFoundError )
  } )
} )
