// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Melete
import { lastSkipped, rememberSkipped, resetScanOutcome } from './scanOutcome.js'
import { markScanned, isScanFresh, resetScanClock } from './scanClock.js'

const MINE = 'user-a'
const THEIRS = 'user-b'

beforeEach( () => {
  resetScanOutcome()
} )

describe( 'the last scan outcome', () => {
  it( 'is empty before any scan', () => {
    expect( lastSkipped( MINE ) ).toEqual( [] )
  } )

  it( 'remembers the paths of the last scan, replacing the earlier ones', () => {
    rememberSkipped( MINE, [ 'A', 'B/C' ] )
    rememberSkipped( MINE, [ 'D' ] )

    expect( lastSkipped( MINE ) ).toEqual( [ 'D' ] )
  } )

  it( 'keeps one list for each user', () => {
    rememberSkipped( MINE, [ 'A' ] )

    expect( lastSkipped( THEIRS ) ).toEqual( [] )
  } )

  it( 'hands out a copy', () => {
    rememberSkipped( MINE, [ 'A' ] )
    lastSkipped( MINE ).push( 'B' )

    expect( lastSkipped( MINE ) ).toEqual( [ 'A' ] )
  } )

  it( 'resets one user or everyone', () => {
    rememberSkipped( MINE, [ 'A' ] )
    rememberSkipped( THEIRS, [ 'B' ] )

    resetScanOutcome( MINE )

    expect( lastSkipped( MINE ) ).toEqual( [] )
    expect( lastSkipped( THEIRS ) ).toEqual( [ 'B' ] )

    resetScanOutcome()

    expect( lastSkipped( THEIRS ) ).toEqual( [] )
  } )

  it( 'is not cleared when the scan clock is reset', () => {
    rememberSkipped( MINE, [ 'A' ] )
    markScanned( MINE, new Date() )
    resetScanClock( MINE )

    expect( isScanFresh( MINE, new Date() ) ).toBe( false )
    expect( lastSkipped( MINE ) ).toEqual( [ 'A' ] )
  } )
} )
