// Packages
import { describe, it, expect } from 'vitest'
// Auth
import {
  ClaimVaultBody,
  CreateVaultBody,
  Me,
  ModuleId,
  Role,
  UserStatus,
  VaultChoice,
  VaultDir,
} from './auth.js'

const me = {
  id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  email: 'naresh@example.com',
  name: 'Naresh',
  role: 'admin',
  modules: [ 'transcriber', 'melete' ],
  vault_dir: 'naresh',
}

describe( 'ModuleId, Role and UserStatus', () => {
  it( 'accept their values only', () => {
    expect( ModuleId.options ).toEqual( [ 'transcriber', 'melete' ] )
    expect( Role.options ).toEqual( [ 'admin', 'member' ] )
    expect( UserStatus.options ).toEqual( [ 'active', 'removed' ] )
    expect( ModuleId.safeParse( 'wealth' ).success ).toBe( false )
    expect( Role.safeParse( 'owner' ).success ).toBe( false )
    expect( UserStatus.safeParse( 'banned' ).success ).toBe( false )
  } )
} )

describe( 'VaultDir', () => {
  it.each( [ 'a', 'naresh', 'my-vault-2', '9', 'a'.repeat( 40 ) ] )( 'accepts %s', ( value ) => {
    expect( VaultDir.parse( value ) ).toBe( value )
  } )

  it.each( [
    '',
    'a'.repeat( 41 ),
    '-a',
    'a-',
    '-',
    'Naresh',
    'my.vault',
    'my_vault',
    'a/b',
    '..',
    '../x',
    'my vault',
  ] )( 'rejects %j', ( value ) => {
    expect( VaultDir.safeParse( value ).success ).toBe( false )
  } )
} )

describe( 'Me', () => {
  it( 'parses a user with a vault', () => {
    expect( Me.parse( me ) ).toEqual( me )
  } )

  it( 'allows a null vault_dir and no modules', () => {
    const member = { ...me, role: 'member', modules: [], vault_dir: null }

    expect( Me.parse( member ) ).toEqual( member )
  } )

  it( 'rejects a bad id, email, role, module or vault_dir', () => {
    expect( Me.safeParse( { ...me, id: 'x' } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, email: 'nope' } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, role: 'owner' } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, modules: [ 'wealth' ] } ).success ).toBe( false )
    expect( Me.safeParse( { ...me, vault_dir: '../x' } ).success ).toBe( false )
  } )

  it( 'requires every field', () => {
    const rest: Record< string, unknown > = { ...me }

    delete rest.vault_dir

    expect( Me.safeParse( rest ).success ).toBe( false )
  } )
} )

describe( 'VaultChoice', () => {
  it( 'lists valid folder names', () => {
    expect( VaultChoice.parse( { folders: [ 'brother', 'shared-notes' ] } ) )
      .toEqual( { folders: [ 'brother', 'shared-notes' ] } )
    expect( VaultChoice.parse( { folders: [] } ) ).toEqual( { folders: [] } )
  } )

  it( 'rejects an invalid folder name', () => {
    expect( VaultChoice.safeParse( { folders: [ 'Bad Name' ] } ).success ).toBe( false )
  } )
} )

describe( 'ClaimVaultBody and CreateVaultBody', () => {
  it.each( [ ClaimVaultBody, CreateVaultBody ] )( 'take one valid vault_dir', ( schema ) => {
    expect( schema.parse( { vault_dir: 'brother' } ) ).toEqual( { vault_dir: 'brother' } )
    expect( schema.safeParse( {} ).success ).toBe( false )
    expect( schema.safeParse( { vault_dir: 'a/b' } ).success ).toBe( false )
  } )
} )
