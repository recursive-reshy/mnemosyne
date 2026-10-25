// Node
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
// Shared
import { ListFoldersResponse } from '@mnemosyne/shared'
// App
import { app } from '../app.js'
// Test support
import { signedInRequest as request } from '../test-support/auth.js'
import { config } from '../config.js'

const vault = vi.hoisted( () => `/tmp/mnemosyne-vault-routes-${ process.pid }` )

// Its own vault, so this file can run beside the jobs routes tests, which wipe the shared one.
vi.mock( '../config.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../config.js' ) >()

  return { config: { ...original.config, vaultPath: vault } }
} )

beforeEach( async () => {
  await rm( config.vaultPath, { recursive: true, force: true } )
  await mkdir( config.vaultPath, { recursive: true } )
} )

afterEach( async () => {
  await rm( config.vaultPath, { recursive: true, force: true } )
} )

describe( 'GET /api/vault/folders', () => {
  it( 'returns the default folder and the tree', async () => {
    await mkdir( join( config.vaultPath, 'Learning', 'AI' ), { recursive: true } )
    await mkdir( join( config.vaultPath, '.obsidian' ) )

    const response = await request( app ).get( '/api/vault/folders' )

    expect( response.status ).toBe( 200 )
    expect( ListFoldersResponse.parse( response.body ) ).toEqual( {
      default_folder: 'Mnemosyne',
      folders: [
        {
          name: 'Learning',
          path: 'Learning',
          children: [ { name: 'AI', path: 'Learning/AI', children: [] } ],
        },
      ],
    } )
  } )

  it( 'returns an empty list for an empty vault', async () => {
    const response = await request( app ).get( '/api/vault/folders' )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { default_folder: 'Mnemosyne', folders: [] } )
  } )
} )
