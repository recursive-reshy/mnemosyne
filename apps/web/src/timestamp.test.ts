// Vitest
import { describe, expect, it } from 'vitest'
// App
import { lineAt, parseTimestampSeconds } from './timestamp'

describe( 'parseTimestampSeconds', () => {
  it.each( [
    [ '- Ownership is central ([12:34](https://youtu.be/abc?t=754))', 754 ],
    [ '> "Memory safety comes free." ([1:05:20](https://youtu.be/abc?t=3920))', 3920 ],
    [ '- Plain stamp ([00:05])', 5 ],
    [ '[02:15] starts the line', 135 ],
    [ 'first [01:00] then [02:00]', 60 ],
    [ '- Plain stamp (00:05)', 5 ],
    [ 'Ownership is central (12:34)', 754 ],
    [ '> "Quote" (1:05:20)', 3920 ],
    [ 'A time like 12:34 without brackets', 754 ],
    [ '[12:34](https://youtu.be/abc?t=754) then 20:00', 754 ],
  ] )( 'reads the first stamp in %j', ( line, seconds ) => {
    expect( parseTimestampSeconds( line ) ).toBe( seconds )
  } )

  it.each( [
    '',
    'No stamp here',
    'A ratio of 3:2 and a version 1:2:3:4',
    'Digits 123:456 are not a time',
    '[not a time]',
    '[12:99]',
  ] )( 'returns null for %j', ( line ) => {
    expect( parseTimestampSeconds( line ) ).toBeNull()
  } )
} )

describe( 'lineAt', () => {
  const text = 'first\nsecond line\n\nlast'

  it.each( [
    [ 0, 'first' ],
    [ 5, 'first' ],
    [ 6, 'second line' ],
    [ 12, 'second line' ],
    [ 18, '' ],
    [ 19, 'last' ],
    [ 23, 'last' ],
  ] )( 'returns the line around index %s', ( index, expected ) => {
    expect( lineAt( text, index ) ).toBe( expected )
  } )
} )
