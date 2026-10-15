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
      whisperModel: 'large-v3-turbo',
      webDir: undefined,
    } )
  } )

  it( 'returns overrides, with port as a number', () => {
    const config = loadConfig( {
      PORT: '4000',
      WHISPER_URL: 'http://host.docker.internal:8178',
      WORK_DIR: '/tmp/custom',
      WHISPER_MODEL: 'large-v3',
      WEB_DIR: '/srv/web',
    } )

    expect( config ).toEqual( {
      port: 4000,
      whisperUrl: 'http://host.docker.internal:8178',
      workDir: '/tmp/custom',
      whisperModel: 'large-v3',
      webDir: '/srv/web',
    } )
  } )

  it( 'treats empty strings as unset', () => {
    const config = loadConfig( { PORT: '', WHISPER_URL: '' } )

    expect( config.port ).toBe( 3100 )
    expect( config.whisperUrl ).toBe( 'http://localhost:8178' )
  } )

  it( 'falls back to the default model for an empty WHISPER_MODEL', () => {
    expect( loadConfig( { WHISPER_MODEL: '' } ).whisperModel ).toBe( 'large-v3-turbo' )
  } )

  it( 'reads WEB_DIR and treats an empty value as unset', () => {
    expect( loadConfig( { WEB_DIR: '/srv/web' } ).webDir ).toBe( '/srv/web' )
    expect( loadConfig( { WEB_DIR: '' } ).webDir ).toBeUndefined()
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
