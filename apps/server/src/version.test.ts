// Node
import { readFileSync } from 'node:fs'
// Packages
import { describe, it, expect } from 'vitest'
// Version
import { appVersion } from './version.js'

describe( 'appVersion', () => {
  it( 'is the version in the server package.json', () => {
    const { version } = JSON.parse(
      readFileSync( new URL( '../package.json', import.meta.url ), 'utf8' ),
    ) as { version: string }

    expect( appVersion ).toBe( version )
  } )
} )
