// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Melete
import { isScanFresh, markScanned, resetScanClock } from './scanClock.js'

const T0 = new Date( '2026-10-22T10:00:00.000Z' )
const at = ( seconds: number ): Date => new Date( T0.getTime() + seconds * 1000 )
const MINE = 'user-a'
const THEIRS = 'user-b'

beforeEach( () => {
  resetScanClock()
} )

describe( 'the scan clock', () => {
  it( 'is not fresh before any scan', () => {
    expect( isScanFresh( MINE, T0 ) ).toBe( false )
  } )

  it( 'is fresh for 30 seconds after a scan', () => {
    markScanned( MINE, T0 )

    expect( isScanFresh( MINE, at( 29 ) ) ).toBe( true )
    expect( isScanFresh( MINE, at( 30 ) ) ).toBe( false )
  } )

  it( 'is not fresh again after a reset', () => {
    markScanned( MINE, T0 )
    resetScanClock( MINE )

    expect( isScanFresh( MINE, at( 1 ) ) ).toBe( false )
  } )
} )

describe( 'the scan clock for two users', () => {
  it( 'times each user\'s scans on their own', () => {
    markScanned( MINE, T0 )

    expect( isScanFresh( MINE, at( 1 ) ) ).toBe( true )
    expect( isScanFresh( THEIRS, at( 1 ) ) ).toBe( false )

    markScanned( THEIRS, at( 20 ) )

    expect( isScanFresh( MINE, at( 31 ) ) ).toBe( false )
    expect( isScanFresh( THEIRS, at( 31 ) ) ).toBe( true )
  } )

  it( 'resets one user without touching the other', () => {
    markScanned( MINE, T0 )
    markScanned( THEIRS, T0 )

    resetScanClock( MINE )

    expect( isScanFresh( MINE, at( 1 ) ) ).toBe( false )
    expect( isScanFresh( THEIRS, at( 1 ) ) ).toBe( true )
  } )

  it( 'resets every user when asked for none in particular', () => {
    markScanned( MINE, T0 )
    markScanned( THEIRS, T0 )

    resetScanClock()

    expect( isScanFresh( MINE, at( 1 ) ) ).toBe( false )
    expect( isScanFresh( THEIRS, at( 1 ) ) ).toBe( false )
  } )
} )
