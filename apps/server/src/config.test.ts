// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { describe, it, expect } from 'vitest'
// Config
import { loadConfig } from './config.js'

describe( 'loadConfig', () => {
  it( 'returns the defaults for an empty environment', () => {
    expect( loadConfig( {} ) ).toEqual( {
      port: 3100,
      whisperUrl: 'http://localhost:8178',
      workDir: join( tmpdir(), 'mnemosyne' ),
    } )
  } )

  it( 'returns overrides, with port as a number', () => {
    const config = loadConfig( {
      PORT: '4000',
      WHISPER_URL: 'http://host.docker.internal:8178',
      WORK_DIR: '/tmp/custom',
    } )

    expect( config ).toEqual( {
      port: 4000,
      whisperUrl: 'http://host.docker.internal:8178',
      workDir: '/tmp/custom',
    } )
  } )

  it( 'treats empty strings as unset', () => {
    const config = loadConfig( { PORT: '', WHISPER_URL: '' } )

    expect( config.port ).toBe( 3100 )
    expect( config.whisperUrl ).toBe( 'http://localhost:8178' )
  } )

  it.each( [ 'abc', '0', '70000' ] )( 'throws naming PORT for PORT=%s', ( port ) => {
    expect( () => loadConfig( { PORT: port } ) ).toThrow( /PORT/ )
  } )

  it( 'throws naming WHISPER_URL for an invalid URL', () => {
    expect( () => loadConfig( { WHISPER_URL: 'not-a-url' } ) ).toThrow( /WHISPER_URL/ )
  } )

  it( 'ignores unrelated variables', () => {
    expect( () => loadConfig( { HOME: '/Users/x', PATH: '/usr/bin' } ) ).not.toThrow()
  } )
} )
