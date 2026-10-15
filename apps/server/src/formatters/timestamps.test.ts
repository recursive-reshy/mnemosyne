// Packages
import { describe, it, expect } from 'vitest'
// Timestamps
import { formatSrtTime } from './timestamps.js'

describe( 'formatSrtTime', () => {
  it.each( [
    [ 0, '00:00:00,000' ],
    [ 4.2, '00:00:04,200' ],
    [ 3725.5, '01:02:05,500' ],
  ] )( 'formats %s as %s', ( seconds, expected ) => {
    expect( formatSrtTime( seconds ) ).toBe( expected )
  } )
} )
