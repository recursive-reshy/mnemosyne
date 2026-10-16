// Node
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
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
import {
  assertVaultWritable,
  listFolderTree,
  resolveFolder,
  writeNote,
} from './vault.client.js'
// Errors
import { ValidationError } from '../errors.js'

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

describe( 'resolveFolder', () => {
  let outside: string

  beforeEach( async () => {
    vault = await realpath( vault )
    outside = await mkdtemp( join( tmpdir(), 'mnemosyne-outside-' ) )
  } )

  afterEach( async () => {
    await rm( outside, { recursive: true, force: true } )
  } )

  it( 'creates nested folders and returns the absolute path', async () => {
    const folder = await resolveFolder( vault, 'A/B/C' )

    expect( folder ).toBe( join( vault, 'A', 'B', 'C' ) )
    expect( ( await stat( folder ) ).isDirectory() ).toBe( true )
  } )

  it( 'returns the vault itself for the root', async () => {
    await expect( resolveFolder( vault, '' ) ).resolves.toBe( vault )
  } )

  it( 'reuses an existing folder', async () => {
    await mkdir( join( vault, 'Learning' ) )
    await writeFile( join( vault, 'Learning', 'keep.md' ), 'x' )

    await resolveFolder( vault, 'Learning' )

    expect( await readdir( join( vault, 'Learning' ) ) ).toEqual( [ 'keep.md' ] )
  } )

  it.each( [ '..', '../x', 'a/../../x', '/etc', '/a', 'a/', '.obsidian', 'a//b' ] )(
    'rejects %j and creates nothing',
    async ( folder ) => {
      await expect( resolveFolder( vault, folder ) ).rejects.toThrow( ValidationError )

      expect( await readdir( vault ) ).toEqual( [] )
      expect( await readdir( outside ) ).toEqual( [] )
    },
  )

  it( 'rejects a symlink that points outside the vault', async () => {
    await symlink( outside, join( vault, 'link' ) )

    await expect( resolveFolder( vault, 'link' ) ).rejects.toThrow( ValidationError )
  } )

  it( 'rejects a new folder below a symlinked ancestor that points outside', async () => {
    await symlink( outside, join( vault, 'link' ) )

    await expect( resolveFolder( vault, 'link/new/deeper' ) ).rejects.toThrow( ValidationError )
    expect( await readdir( outside ) ).toEqual( [] )
  } )

  it( 'allows a symlink that points to another folder inside the vault', async () => {
    await mkdir( join( vault, 'real' ) )
    await symlink( join( vault, 'real' ), join( vault, 'alias' ) )

    await expect( resolveFolder( vault, 'alias/sub' ) )
      .resolves.toBe( join( vault, 'real', 'sub' ) )
  } )

  it( 'rejects a sibling folder that merely shares the vault name as a prefix', async () => {
    const sibling = `${ vault }-sibling`
    await mkdir( sibling )
    await symlink( sibling, join( vault, 'link' ) )

    await expect( resolveFolder( vault, 'link' ) ).rejects.toThrow( ValidationError )

    await rm( sibling, { recursive: true, force: true } )
  } )
} )

describe( 'listFolderTree', () => {
  it( 'returns an empty list for an empty vault', async () => {
    await expect( listFolderTree( vault ) ).resolves.toEqual( [] )
  } )

  it( 'lists directories only, nested, with vault-relative paths', async () => {
    await mkdir( join( vault, 'Learning', 'AI' ), { recursive: true } )
    await mkdir( join( vault, 'Learning', 'Rust' ) )
    await writeFile( join( vault, 'Learning', 'note.md' ), 'x' )
    await writeFile( join( vault, 'root.md' ), 'x' )

    await expect( listFolderTree( vault ) ).resolves.toEqual( [
      {
        name: 'Learning',
        path: 'Learning',
        children: [
          { name: 'AI', path: 'Learning/AI', children: [] },
          { name: 'Rust', path: 'Learning/Rust', children: [] },
        ],
      },
    ] )
  } )

  it( 'skips dot-folders at every level', async () => {
    await mkdir( join( vault, '.obsidian' ) )
    await mkdir( join( vault, '.trash', 'x' ), { recursive: true } )
    await mkdir( join( vault, 'A', '.git' ), { recursive: true } )

    await expect( listFolderTree( vault ) ).resolves.toEqual( [
      { name: 'A', path: 'A', children: [] },
    ] )
  } )

  it( 'does not follow or list symlinks', async () => {
    const outside = await mkdtemp( join( tmpdir(), 'mnemosyne-outside-' ) )
    await mkdir( join( outside, 'secret' ) )
    await mkdir( join( vault, 'Real' ) )
    await symlink( outside, join( vault, 'link' ) )
    await symlink( join( vault, 'Real' ), join( vault, 'alias' ) )
    await writeFile( join( vault, 'file.md' ), 'x' )
    await symlink( join( vault, 'file.md' ), join( vault, 'filelink' ) )

    await expect( listFolderTree( vault ) ).resolves.toEqual( [
      { name: 'Real', path: 'Real', children: [] },
    ] )

    await rm( outside, { recursive: true, force: true } )
  } )

  it( 'sorts case-insensitively at every level', async () => {
    for( const name of [ 'beta', 'Alpha', 'gamma', 'Delta' ] ) {
      await mkdir( join( vault, name ) )
    }
    for( const name of [ 'b', 'A', 'c' ] ) {
      await mkdir( join( vault, 'gamma', name ) )
    }

    const tree = await listFolderTree( vault )

    expect( tree.map( ( { name } ) => name ) ).toEqual( [ 'Alpha', 'beta', 'Delta', 'gamma' ] )
    expect( tree[ 3 ]?.children.map( ( { name } ) => name ) ).toEqual( [ 'A', 'b', 'c' ] )
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
