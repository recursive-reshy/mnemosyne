// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { getAppSetting, setAppSetting } from './appSettings.repository.js'

describe( 'getAppSetting', () => {
  it( 'is undefined while unset', () => {
    expect( getAppSetting( 'feed_check_interval_minutes' ) ).toBeUndefined()
  } )
} )

describe( 'setAppSetting', () => {
  it( 'stores a JSON value and overwrites it', () => {
    setAppSetting( 'feed_check_interval_minutes', 30 )

    expect( getAppSetting( 'feed_check_interval_minutes' ) ).toBe( 30 )

    setAppSetting( 'feed_check_interval_minutes', 60 )

    expect( getAppSetting( 'feed_check_interval_minutes' ) ).toBe( 60 )
  } )
} )
