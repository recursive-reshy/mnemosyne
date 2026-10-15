// Packages
import { describe, it, expect } from 'vitest'
// Filename
import { noteBasename } from './filename.js'

describe( 'noteBasename', () => {
  it( 'replaces unsafe characters and collapses whitespace', () => {
    expect( noteBasename( 'How Rust Works: Ownership #1' ) ).toBe( 'How Rust Works Ownership 1' )
  } )

  it( 'replaces every unsafe character and control characters', () => {
    expect( noteBasename( 'a/b\\c:d*e?f"g<h>i|j#k^l[m]n\to\nz' ) ).toBe(
      'a b c d e f g h i j k l m n o z',
    )
  } )

  it( 'keeps non-English titles', () => {
    expect( noteBasename( '日本語のタイトル' ) ).toBe( '日本語のタイトル' )
  } )

  it( 'falls back to Untitled when nothing is left', () => {
    expect( noteBasename( '???' ) ).toBe( 'Untitled' )
    expect( noteBasename( '...' ) ).toBe( 'Untitled' )
    expect( noteBasename( '' ) ).toBe( 'Untitled' )
  } )

  it( 'uses the given fallback', () => {
    expect( noteBasename( '???', 'transcript' ) ).toBe( 'transcript' )
  } )

  it( 'trims trailing dots', () => {
    expect( noteBasename( 'Title...' ) ).toBe( 'Title' )
    expect( noteBasename( 'Title. . ' ) ).toBe( 'Title' )
  } )

  it( 'cuts to 100 characters', () => {
    expect( noteBasename( 'a'.repeat( 150 ) ) ).toBe( 'a'.repeat( 100 ) )
  } )

  it( 'trims again after the cut', () => {
    expect( noteBasename( `${ 'a'.repeat( 99 ) } bbb` ) ).toBe( 'a'.repeat( 99 ) )
  } )

  it( 'does not split a surrogate pair at the cut', () => {
    expect( noteBasename( `${ 'a'.repeat( 99 ) }😀tail` ) ).toBe( 'a'.repeat( 99 ) )
  } )
} )
