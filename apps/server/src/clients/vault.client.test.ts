// Node
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Clients
import { assertVaultWritable, writeNote } from './vault.client.js'

const isRoot = process.getuid?.() === 0

let vault: string

beforeEach( async () => {
  vault = await mkdtemp( join( tmpdir(), 'mnemosyne-vault-' ) )
} )

afterEach( async () => {
  await chmod( vault, 0o755 )
  await rm( vault, { recursive: true, force: true } )
} )

describe( 'writeNote', () => {
  it( 'creates the Mnemosyne folder and writes the note', async () => {
    const path = await writeNote( vault, 'What Is RAG: A Primer', '# Note\n' )

    expect( path ).toBe( 'Mnemosyne/What Is RAG A Primer.md' )
    expect( await readFile( join( vault, path ), 'utf8' ) ).toBe( '# Note\n' )
  } )

  it( 'uses an existing Mnemosyne folder', async () => {
    await mkdir( join( vault, 'Mnemosyne' ) )

    await expect( writeNote( vault, 'Title', 'x' ) ).resolves.toBe( 'Mnemosyne/Title.md' )
  } )

  it( 'never overwrites: a clash gets (2), then (3)', async () => {
    const first = await writeNote( vault, 'Title', 'one' )
    const second = await writeNote( vault, 'Title', 'two' )
    const third = await writeNote( vault, 'Title', 'three' )

    expect( [ first, second, third ] ).toEqual( [
      'Mnemosyne/Title.md',
      'Mnemosyne/Title (2).md',
      'Mnemosyne/Title (3).md',
    ] )
    expect( await readFile( join( vault, first ), 'utf8' ) ).toBe( 'one' )
    expect( await readFile( join( vault, third ), 'utf8' ) ).toBe( 'three' )
  } )

  it( 'skips a numbered name that already exists', async () => {
    await writeNote( vault, 'Title', 'one' )
    await writeFile( join( vault, 'Mnemosyne', 'Title (2).md' ), 'taken' )

    await expect( writeNote( vault, 'Title', 'two' ) ).resolves.toBe( 'Mnemosyne/Title (3).md' )
  } )

  it( 'falls back to Untitled', async () => {
    await expect( writeNote( vault, '???', 'x' ) ).resolves.toBe( 'Mnemosyne/Untitled.md' )
  } )

  it.skipIf( isRoot )( 'propagates a permission error', async () => {
    await mkdir( join( vault, 'Mnemosyne' ) )
    await chmod( join( vault, 'Mnemosyne' ), 0o555 )

    await expect( writeNote( vault, 'Title', 'x' ) ).rejects.toThrow( /EACCES/ )
    expect( await readdir( join( vault, 'Mnemosyne' ) ) ).toEqual( [] )

    await chmod( join( vault, 'Mnemosyne' ), 0o755 )
  } )
} )

describe( 'assertVaultWritable', () => {
  it( 'passes for a writable folder', async () => {
    await expect( assertVaultWritable( vault ) ).resolves.toBeUndefined()
  } )

  it( 'names the path when the folder does not exist', async () => {
    const missing = join( vault, 'nope' )

    await expect( assertVaultWritable( missing ) ).rejects.toThrow( `VAULT_PATH ${ missing }` )
  } )

  it( 'rejects a path that is a file', async () => {
    const file = join( vault, 'file.txt' )
    await writeFile( file, 'x' )

    await expect( assertVaultWritable( file ) ).rejects.toThrow( 'is not a folder' )
  } )

  it.skipIf( isRoot )( 'rejects a read-only folder', async () => {
    await chmod( vault, 0o555 )

    await expect( assertVaultWritable( vault ) ).rejects.toThrow( 'is not writable' )
  } )
} )
