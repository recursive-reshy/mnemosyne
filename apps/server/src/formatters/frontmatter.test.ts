// Packages
import { describe, it, expect } from 'vitest'
// Formatters
import { quoted, singleLine } from './frontmatter.js'

describe( 'singleLine', () => {
  it( 'replaces line breaks with spaces', () => {
    expect( singleLine( 'a\nb\r\nc\rd' ) ).toBe( 'a b c d' )
  } )

  it( 'leaves a single line alone', () => {
    expect( singleLine( 'plain text' ) ).toBe( 'plain text' )
  } )
} )

describe( 'quoted', () => {
  it( 'wraps the value in double quotes', () => {
    expect( quoted( 'Title' ) ).toBe( '"Title"' )
  } )

  it( 'escapes backslashes and double quotes', () => {
    expect( quoted( 'say "hi" \\ bye' ) ).toBe( '"say \\"hi\\" \\\\ bye"' )
  } )

  it( 'keeps the value on one line', () => {
    expect( quoted( 'a\nb' ) ).toBe( '"a b"' )
  } )
} )
