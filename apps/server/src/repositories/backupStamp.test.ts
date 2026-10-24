// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { backupStamp } from './backupStamp.js'

describe( 'backupStamp', () => {
  it( 'uses Singapore time, without colons', () => {
    expect( backupStamp( new Date( '2026-10-22T20:30:05Z' ) ) ).toBe( '20261023-043005' )
  } )

  it( 'zero-pads a midnight hour', () => {
    expect( backupStamp( new Date( '2026-10-22T16:00:00Z' ) ) ).toBe( '20261023-000000' )
  } )
} )
