// Node
import { readdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Melete
import {
  bodyHash,
  listSubjectFolders,
  noteTitle,
  splitFrontMatter,
  walkSubject,
} from './scan.js'
// Errors
import { ValidationError } from '../errors.js'
// Test support
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

describe( 'splitFrontMatter', () => {
  it( 'separates the front-matter from the body', () => {
    expect( splitFrontMatter( '---\ntitle: A\ntags: [x]\n---\n\n# Body\n' ) )
      .toEqual( { frontMatter: 'title: A\ntags: [x]', body: '\n# Body\n' } )
  } )

  it( 'returns the whole text when there is no front-matter', () => {
    expect( splitFrontMatter( '# Body\n' ) ).toEqual( { frontMatter: null, body: '# Body\n' } )
  } )

  it( 'treats an unterminated opening line as body', () => {
    const text = '---\ntitle: A\n# Body\n'

    expect( splitFrontMatter( text ) ).toEqual( { frontMatter: null, body: text } )
  } )

  it( 'reads CRLF files', () => {
    expect( splitFrontMatter( '---\r\ntitle: A\r\n---\r\nBody\r\n' ) )
      .toEqual( { frontMatter: 'title: A', body: 'Body\r\n' } )
  } )

  it( 'does not mistake a rule in the body for front-matter', () => {
    const text = '# Body\n\n---\n\nMore\n'

    expect( splitFrontMatter( text ) ).toEqual( { frontMatter: null, body: text } )
  } )

  it( 'stops at the first closing line', () => {
    expect( splitFrontMatter( '---\na: 1\n---\nBody\n---\nMore\n' ) )
      .toEqual( { frontMatter: 'a: 1', body: 'Body\n---\nMore\n' } )
  } )

  it( 'accepts malformed YAML and an empty file', () => {
    expect( splitFrontMatter( '---\n: : [\n---\nBody' ) )
      .toEqual( { frontMatter: ': : [', body: 'Body' } )
    expect( splitFrontMatter( '' ) ).toEqual( { frontMatter: null, body: '' } )
  } )
} )

describe( 'noteTitle', () => {
  it.each( [
    [ 'title: Generics', 'Generics' ],
    [ 'title: "Types: a primer"', 'Types: a primer' ],
    [ 'title: \'It\'s fine\'', 'It\'s fine' ],
    [ 'tags: [a]\ntitle:   Spaced out  \nother: 1', 'Spaced out' ],
    [ 'title: Types: a primer', 'Types: a primer' ],
  ] )( 'reads %j from the front-matter', ( frontMatter, expected ) => {
    expect( noteTitle( frontMatter, 'Learning/TS/File name.md' ) ).toBe( expected )
  } )

  it.each( [
    [ 'title:' ],
    [ 'title: ""' ],
    [ 'title: [a, b]' ],
    [ 'title:\n  - a\n  - b' ],
    [ 'title: |\n  text' ],
    [ 'tags: [a]' ],
    [ ' title: indented' ],
  ] )( 'falls back to the file name for %j', ( frontMatter ) => {
    expect( noteTitle( frontMatter, 'Learning/TS/File name.md' ) ).toBe( 'File name' )
  } )

  it( 'uses the file name without front-matter', () => {
    expect( noteTitle( null, 'Learning/TS/Deep/Generics.md' ) ).toBe( 'Generics' )
    expect( noteTitle( null, 'Top.md' ) ).toBe( 'Top' )
  } )
} )

describe( 'bodyHash', () => {
  it( 'is a SHA-256 hex digest', () => {
    expect( bodyHash( 'text' ) ).toMatch( /^[0-9a-f]{64}$/ )
  } )

  it( 'ignores line endings, trailing whitespace and outer blank lines', () => {
    const plain = bodyHash( 'one\ntwo\n\nthree' )

    expect( bodyHash( 'one\r\ntwo\r\n\r\nthree\r\n' ) ).toBe( plain )
    expect( bodyHash( 'one  \ntwo\t\n\nthree   ' ) ).toBe( plain )
    expect( bodyHash( '\n\none\ntwo\n\nthree\n\n\n' ) ).toBe( plain )
  } )

  it( 'changes with the content, inner blank lines and leading spaces', () => {
    const plain = bodyHash( 'one\ntwo' )

    expect( bodyHash( 'one\ntwo!' ) ).not.toBe( plain )
    expect( bodyHash( 'one\n\ntwo' ) ).not.toBe( plain )
    expect( bodyHash( 'one\n  two' ) ).not.toBe( plain )
  } )

  it( 'does not change when only the front-matter does', () => {
    const first = splitFrontMatter( '---\ntitle: A\n---\nBody\n' ).body
    const second = splitFrontMatter( '---\ntitle: B\ntags: [x]\n---\n\nBody\n' ).body

    expect( bodyHash( first ) ).toBe( bodyHash( second ) )
  } )
} )

describe( 'on a vault', () => {
  let vault: MeleteVault

  beforeEach( async () => {
    vault = await createMeleteVault()
  } )

  afterEach( async () => {
    await vault.cleanup()
  } )

  describe( 'walkSubject', () => {
    it( 'lists the Markdown files of a subject, nested, relative to the vault', async () => {
      const files = await walkSubject( vault.vaultPath, 'Learning/TypeScript' )

      expect( files.map( ( { path } ) => path ).sort() ).toEqual( [
        'Learning/TypeScript/Advanced/Conditional Types.md',
        'Learning/TypeScript/Generics.md',
      ] )
    } )

    it( 'returns the modification time and size of each file', async () => {
      const [ file ] = await walkSubject( vault.vaultPath, 'Learning/Rust' )

      expect( file?.size ).toBeGreaterThan( 0 )
      expect( file?.mtimeMs ).toBeGreaterThan( 0 )
    } )

    it( 'skips dot-folders, other file types and links that leave the vault', async () => {
      const paths = ( await walkSubject( vault.vaultPath, 'Learning/TypeScript' ) )
        .map( ( { path } ) => path )

      expect( paths.some( ( path ) => path.includes( '.trash' ) ) ).toBe( false )
      expect( paths.some( ( path ) => path.endsWith( '.png' ) ) ).toBe( false )
      expect( paths ).not.toContain( 'Learning/TypeScript/Leak.md' )
      expect( paths.some( ( path ) => path.includes( 'Linked' ) ) ).toBe( false )
    } )

    it( 'follows a file link that stays inside the vault', async () => {
      await symlink(
        join( vault.vaultPath, 'Learning/Rust/Ownership.md' ),
        join( vault.vaultPath, 'Learning/Rust/Alias.md' ),
      )

      const paths = ( await walkSubject( vault.vaultPath, 'Learning/Rust' ) )
        .map( ( { path } ) => path )
        .sort()

      expect( paths ).toEqual( [ 'Learning/Rust/Alias.md', 'Learning/Rust/Ownership.md' ] )
    } )

    it( 'fails when there are more files than the cap, naming it', async () => {
      await expect( walkSubject( vault.vaultPath, 'Learning/TypeScript', 1 ) )
        .rejects.toThrow( ValidationError )
      await expect( walkSubject( vault.vaultPath, 'Learning/TypeScript', 1 ) )
        .rejects.toThrow( /1 files/ )
    } )

    it( 'accepts exactly the cap', async () => {
      await expect( walkSubject( vault.vaultPath, 'Learning/TypeScript', 2 ) )
        .resolves.toHaveLength( 2 )
    } )

    it( 'fails for a subject folder that does not exist', async () => {
      await expect( walkSubject( vault.vaultPath, 'Learning/Missing' ) )
        .rejects.toThrow( ValidationError )
    } )
  } )

  describe( 'listSubjectFolders', () => {
    it( 'lists the direct child folders of the learning root, sorted', async () => {
      expect( await listSubjectFolders( vault.vaultPath, 'Learning' ) )
        .toEqual( [ 'Learning/Rust', 'Learning/TypeScript' ] )
    } )

    it( 'ignores notes directly in the learning root and dot-folders', async () => {
      const folders = await listSubjectFolders( vault.vaultPath, 'Learning' )

      expect( folders ).not.toContain( 'Learning/.hidden' )
      expect( folders ).toHaveLength( 2 )
    } )

    it( 'fails for a learning root that is missing', async () => {
      await expect( listSubjectFolders( vault.vaultPath, 'Nope' ) )
        .rejects.toThrow( ValidationError )
    } )

    it( 'fails for a learning root that leaves the vault', async () => {
      await symlink( vault.outsidePath, join( vault.vaultPath, 'Escape' ) )

      await expect( listSubjectFolders( vault.vaultPath, 'Escape' ) )
        .rejects.toThrow( ValidationError )
    } )

    it( 'does not create a missing learning root', async () => {
      await expect( listSubjectFolders( vault.vaultPath, 'Nope' ) )
        .rejects.toThrow( /doesn't exist/ )

      expect( await readdir( vault.vaultPath ) ).not.toContain( 'Nope' )
    } )
  } )
} )
