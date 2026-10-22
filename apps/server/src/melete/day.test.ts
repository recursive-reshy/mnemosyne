// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { dayStart } from './day.js'

const singapore = { timeZone: 'Asia/Singapore', startHour: 4 }
const newYork = ( startHour: number ) => ( { timeZone: 'America/New_York', startHour } )

const start = (
  now: string,
  options: { timeZone: string, startHour: number },
): string => dayStart( new Date( now ), options ).toISOString()

describe( 'dayStart in a zone without daylight saving (Singapore, UTC+8)', () => {
  it( 'is 04:00 today once 04:00 has passed', () => {
    expect( start( '2026-10-22T00:00:00.000Z', singapore ) ).toBe( '2026-10-21T20:00:00.000Z' )
    expect( start( '2026-10-21T15:30:00.000Z', singapore ) ).toBe( '2026-10-20T20:00:00.000Z' )
  } )

  it( 'is the start itself at exactly 04:00', () => {
    expect( start( '2026-10-21T20:00:00.000Z', singapore ) ).toBe( '2026-10-21T20:00:00.000Z' )
  } )

  it( 'is 04:00 yesterday just before 04:00', () => {
    expect( start( '2026-10-21T19:59:59.000Z', singapore ) ).toBe( '2026-10-20T20:00:00.000Z' )
  } )

  it( 'is local midnight when the start hour is 0', () => {
    const midnight = { timeZone: 'Asia/Singapore', startHour: 0 }

    expect( start( '2026-10-22T03:00:00.000Z', midnight ) ).toBe( '2026-10-21T16:00:00.000Z' )
    expect( start( '2026-10-21T15:59:59.000Z', midnight ) ).toBe( '2026-10-20T16:00:00.000Z' )
  } )

  it( 'crosses a month and a year boundary', () => {
    expect( start( '2027-01-01T00:00:00.000Z', singapore ) ).toBe( '2026-12-31T20:00:00.000Z' )
    expect( start( '2026-12-31T19:00:00.000Z', singapore ) ).toBe( '2026-12-30T20:00:00.000Z' )
  } )
} )

describe( 'dayStart in a zone with daylight saving (New York)', () => {
  it( 'uses EDT in summer and EST in winter', () => {
    expect( start( '2026-07-10T12:00:00.000Z', newYork( 4 ) ) ).toBe( '2026-07-10T08:00:00.000Z' )
    expect( start( '2026-12-10T12:00:00.000Z', newYork( 4 ) ) ).toBe( '2026-12-10T09:00:00.000Z' )
  } )

  it( 'handles the fall-back day, 2026-11-01', () => {
    expect( start( '2026-11-01T12:00:00.000Z', newYork( 4 ) ) ).toBe( '2026-11-01T09:00:00.000Z' )
    expect( start( '2026-11-01T08:00:00.000Z', newYork( 4 ) ) ).toBe( '2026-10-31T08:00:00.000Z' )
  } )

  it( 'handles the spring-forward day, 2027-03-14', () => {
    expect( start( '2027-03-14T12:00:00.000Z', newYork( 4 ) ) ).toBe( '2027-03-14T08:00:00.000Z' )
    expect( start( '2027-03-14T07:00:00.000Z', newYork( 4 ) ) ).toBe( '2027-03-13T09:00:00.000Z' )
  } )

  it( 'uses the first 01:00 on the fall-back day, when that hour happens twice', () => {
    expect( start( '2026-11-01T12:00:00.000Z', newYork( 1 ) ) ).toBe( '2026-11-01T05:00:00.000Z' )
  } )

  it( 'uses the moment the clocks jump when the start hour is skipped', () => {
    expect( start( '2027-03-14T12:00:00.000Z', newYork( 2 ) ) ).toBe( '2027-03-14T07:00:00.000Z' )
    expect( start( '2027-03-14T06:30:00.000Z', newYork( 2 ) ) ).toBe( '2027-03-13T07:00:00.000Z' )
  } )

  it( 'is never after now and never more than 25 hours before it', () => {
    const from = Date.parse( '2026-10-30T00:00:00.000Z' )
    const to = Date.parse( '2026-11-03T00:00:00.000Z' )

    for( let t = from; t < to; t += 17 * 60_000 ) {
      for( const startHour of [ 0, 1, 2, 4 ] ) {
        const now = new Date( t )
        const result = dayStart( now, newYork( startHour ) )

        expect( result.getTime() ).toBeLessThanOrEqual( now.getTime() )
        expect( now.getTime() - result.getTime() ).toBeLessThanOrEqual( 25 * 3_600_000 )
      }
    }
  } )
} )

describe( 'dayStart defaults', () => {
  it( 'reads the zone and hour from the config', () => {
    const now = new Date( '2026-10-22T00:00:00.000Z' )

    expect( dayStart( now ).getTime() ).toBeLessThanOrEqual( now.getTime() )
  } )
} )
