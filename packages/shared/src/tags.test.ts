// Packages
import { describe, it, expect } from 'vitest'
// Tags
import { normalizeTag } from './tags.js'

describe( 'normalizeTag', () => {
  it( 'lowercases and turns spaces into hyphens', () => {
    expect( normalizeTag( 'Machine Learning' ) ).toBe( 'machine-learning' )
  } )

  it( 'strips other invalid characters', () => {
    expect( normalizeTag( '#Rust!' ) ).toBe( 'rust' )
    expect( normalizeTag( 'c++' ) ).toBe( 'c' )
    expect( normalizeTag( 'a/b' ) ).toBe( 'ab' )
    expect( normalizeTag( '[x]' ) ).toBe( 'x' )
  } )

  it( 'collapses repeated hyphens and trims them from the ends', () => {
    expect( normalizeTag( ' -Deep  Learning- ' ) ).toBe( 'deep-learning' )
  } )

  it( 'returns an empty string when nothing valid is left', () => {
    expect( normalizeTag( '!!!' ) ).toBe( '' )
    expect( normalizeTag( '   ' ) ).toBe( '' )
  } )

  it( 'keeps digits', () => {
    expect( normalizeTag( 'GPT 4' ) ).toBe( 'gpt-4' )
  } )
} )
