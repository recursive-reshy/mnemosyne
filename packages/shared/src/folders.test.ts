// Packages
import { describe, it, expect } from 'vitest'
// Folders
import { isValidFolderName, parseFolderPath } from './folders.js'

describe( 'isValidFolderName', () => {
  it.each( [ 'Learning', 'AI notes', 'Café', 'a.b', 'x'.repeat( 100 ) ] )(
    'accepts %s',
    ( name ) => {
      expect( isValidFolderName( name ) ).toBe( true )
    },
  )

  it.each( [ '/', '\\', ':', '*', '?', '"', '<', '>', '|' ] )(
    'rejects a name containing %s',
    ( character ) => {
      expect( isValidFolderName( `a${ character }b` ) ).toBe( false )
    },
  )

  it.each( [ '', '.', '..', '.obsidian', 'a\u0000b', 'a\nb', 'x'.repeat( 101 ) ] )(
    'rejects %j',
    ( name ) => {
      expect( isValidFolderName( name ) ).toBe( false )
    },
  )
} )

describe( 'parseFolderPath', () => {
  it( 'treats the empty string as the vault root', () => {
    expect( parseFolderPath( '' ) ).toEqual( [] )
  } )

  it( 'splits a path into segments', () => {
    expect( parseFolderPath( 'Learning' ) ).toEqual( [ 'Learning' ] )
    expect( parseFolderPath( 'Learning/AI/RAG' ) ).toEqual( [ 'Learning', 'AI', 'RAG' ] )
  } )

  const rejected = [
    '/a', 'a/', '/', 'a//b', 'a/../b', '..', '.', '.hidden/a', 'a/.trash', 'a\\b', 'a:b',
  ]

  it.each( rejected )(
    'throws on %j',
    ( path ) => {
      expect( () => parseFolderPath( path ) ).toThrow()
    },
  )
} )
