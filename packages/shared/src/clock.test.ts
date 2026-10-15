// Packages
import { describe, it, expect } from 'vitest'
// Clock
import { formatClock } from './clock.js'

describe( 'formatClock', () => {
  it.each( [
    [ 0, '00:00' ],
    [ 59.9, '00:59' ],
    [ 135, '02:15' ],
    [ 3599, '59:59' ],
    [ 3600, '1:00:00' ],
    [ 3723.4, '1:02:03' ],
  ] )( 'formats %s as %s', ( seconds, expected ) => {
    expect( formatClock( seconds ) ).toBe( expected )
  } )
} )
