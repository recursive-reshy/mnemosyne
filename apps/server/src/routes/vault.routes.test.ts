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
} from 'vitest'
import request from 'supertest'
// Shared
import { ListFoldersResponse } from '@mnemosyne/shared'
// App
import { app } from '../app.js'
import { config } from '../config.js'

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
