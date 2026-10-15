// Packages
import { describe, it, expect } from 'vitest'
// Paragraphs
import { groupParagraphs } from './paragraphs.js'

describe( 'groupParagraphs', () => {
  it( 'splits on a gap of 2 seconds', () => {
    const result = groupParagraphs( [
      { start: 0, end: 5, text: 'One.' },
      { start: 7, end: 9, text: 'Two.' },
    ] )

    expect( result ).toEqual( [
      { start: 0, text: 'One.' },
      { start: 7, text: 'Two.' },
    ] )
  } )

  it( 'does not split on a gap of 1.9 seconds', () => {
    const result = groupParagraphs( [
      { start: 0, end: 5, text: 'One.' },
      { start: 6.9, end: 9, text: 'Two.' },
    ] )

    expect( result ).toEqual( [ { start: 0, text: 'One. Two.' } ] )
  } )

  it( 'splits at a sentence end once the paragraph spans 45 seconds', () => {
    const result = groupParagraphs( [
      { start: 0, end: 45, text: 'Long one.' },
      { start: 45, end: 50, text: 'Next.' },
    ] )

    expect( result ).toEqual( [
      { start: 0, text: 'Long one.' },
      { start: 45, text: 'Next.' },
    ] )
  } )

  it( 'splits after ! and ? too', () => {
    const result = groupParagraphs( [
      { start: 0, end: 46, text: 'Really?' },
      { start: 46, end: 50, text: 'Yes!' },
      { start: 50, end: 100, text: 'Wow!' },
      { start: 100, end: 101, text: 'Fine.' },
    ] )

    expect( result.map( ( { start } ) => start ) ).toEqual( [ 0, 46, 100 ] )
  } )

  it( 'does not split after 45 seconds when the sentence has not ended', () => {
    const result = groupParagraphs( [
      { start: 0, end: 46, text: 'and then' },
      { start: 46, end: 50, text: 'more.' },
    ] )

    expect( result ).toEqual( [ { start: 0, text: 'and then more.' } ] )
  } )

  it( 'does not split before 45 seconds at a sentence end', () => {
    const result = groupParagraphs( [
      { start: 0, end: 44, text: 'Short.' },
      { start: 44, end: 50, text: 'More.' },
    ] )

    expect( result ).toHaveLength( 1 )
  } )

  it( 'splits when a segment would push the paragraph past 90 seconds', () => {
    const result = groupParagraphs( [
      { start: 0, end: 40, text: 'a' },
      { start: 40, end: 80, text: 'b' },
      { start: 80, end: 90.5, text: 'c' },
    ] )

    expect( result ).toEqual( [
      { start: 0, text: 'a b' },
      { start: 80, text: 'c' },
    ] )
  } )

  it( 'allows a paragraph to span exactly 90 seconds', () => {
    const result = groupParagraphs( [
      { start: 0, end: 40, text: 'a' },
      { start: 40, end: 90, text: 'b' },
    ] )

    expect( result ).toEqual( [ { start: 0, text: 'a b' } ] )
  } )

  it( 'trims and collapses whitespace', () => {
    const result = groupParagraphs( [ { start: 0, end: 2, text: '  a \n  b\tc  ' } ] )

    expect( result ).toEqual( [ { start: 0, text: 'a b c' } ] )
  } )

  it( 'skips empty segments without affecting gaps', () => {
    const result = groupParagraphs( [
      { start: 0, end: 2, text: 'One.' },
      { start: 2, end: 30, text: '   ' },
      { start: 3, end: 4, text: 'Two.' },
    ] )

    expect( result ).toEqual( [ { start: 0, text: 'One. Two.' } ] )
  } )

  it( 'returns an empty array for no or only empty segments', () => {
    expect( groupParagraphs( [] ) ).toEqual( [] )
    expect( groupParagraphs( [ { start: 0, end: 1, text: ' ' } ] ) ).toEqual( [] )
  } )
} )
