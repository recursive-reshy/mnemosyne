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

beforeEach( () => {
  resetScanClock()
} )

describe( 'the scan clock', () => {
  it( 'is not fresh before any scan', () => {
    expect( isScanFresh( T0 ) ).toBe( false )
  } )

  it( 'is fresh for 30 seconds after a scan', () => {
    markScanned( T0 )

    expect( isScanFresh( at( 29 ) ) ).toBe( true )
    expect( isScanFresh( at( 30 ) ) ).toBe( false )
  } )

  it( 'is not fresh again after a reset', () => {
    markScanned( T0 )
    resetScanClock()

    expect( isScanFresh( at( 1 ) ) ).toBe( false )
  } )
} )
