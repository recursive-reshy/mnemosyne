// Express
import type { Request } from 'express'
// Packages
import { describe, it, expect } from 'vitest'
// Errors
import { UnknownOriginError } from '../errors.js'
// Middleware
import { requestOrigin, requestScheme } from './requestOrigin.js'

const ORIGINS = [ 'http://localhost:3100', 'https://mac.tail1234.ts.net' ]

type Fake = {
  peer?: string
  encrypted?: boolean
  headers?: Record< string, string >
}

const buildRequest = ( { peer = '127.0.0.1', encrypted = false, headers = {} }: Fake ): Request => {
  return {
    headers,
    socket: { remoteAddress: peer, encrypted },
  } as unknown as Request
}

describe( 'requestOrigin', () => {
  it( 'uses the socket scheme and Host for a direct request', () => {
    const req = buildRequest( { headers: { host: 'localhost:3100' } } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'http://localhost:3100' )
  } )

  it( 'reads X-Forwarded-Proto and X-Forwarded-Host from a loopback peer', () => {
    const req = buildRequest( {
      headers: {
        host: 'localhost:3100',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'mac.tail1234.ts.net',
      },
    } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'https://mac.tail1234.ts.net' )
  } )

  it.each( [ '::1', '::ffff:127.0.0.1', '127.0.0.1' ] )( 'treats %s as loopback', ( peer ) => {
    const req = buildRequest( {
      peer,
      headers: {
        host: 'localhost:3100',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'mac.tail1234.ts.net',
      },
    } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'https://mac.tail1234.ts.net' )
  } )

  it( 'ignores forwarded headers from a peer that is not loopback', () => {
    const req = buildRequest( {
      peer: '100.64.0.7',
      headers: {
        host: 'localhost:3100',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'mac.tail1234.ts.net',
      },
    } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'http://localhost:3100' )
  } )

  it( 'refuses a spoofed forwarded host from a peer that is not loopback', () => {
    const req = buildRequest( {
      peer: '100.64.0.7',
      headers: { host: 'evil.test', 'x-forwarded-host': 'localhost:3100' },
    } )

    expect( () => requestOrigin( req, ORIGINS ) ).toThrow( UnknownOriginError )
  } )

  it( 'uses the first value of a comma-separated forwarded header', () => {
    const req = buildRequest( {
      headers: {
        host: 'localhost:3100',
        'x-forwarded-proto': 'https, http',
        'x-forwarded-host': 'mac.tail1234.ts.net, other.test',
      },
    } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'https://mac.tail1234.ts.net' )
  } )

  it( 'takes the scheme from the socket when only X-Forwarded-Host is sent', () => {
    const req = buildRequest( {
      headers: { host: 'x', 'x-forwarded-host': 'localhost:3100' },
    } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'http://localhost:3100' )
  } )

  it( 'uses https for a TLS socket', () => {
    const req = buildRequest( {
      encrypted: true,
      headers: { host: 'mac.tail1234.ts.net' },
    } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'https://mac.tail1234.ts.net' )
  } )

  it( 'matches the https origin for a loopback request with only the Tailscale Host', () => {
    const req = buildRequest( { headers: { host: 'mac.tail1234.ts.net' } } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'https://mac.tail1234.ts.net' )
  } )

  it( 'does not upgrade to https for a peer that is not loopback', () => {
    const req = buildRequest( { peer: '100.64.0.7', headers: { host: 'mac.tail1234.ts.net' } } )

    expect( () => requestOrigin( req, ORIGINS ) ).toThrow( UnknownOriginError )
  } )

  it( 'compares case-insensitively and returns the configured spelling', () => {
    const req = buildRequest( { headers: { host: 'LocalHost:3100' } } )

    expect( requestOrigin( req, ORIGINS ) ).toBe( 'http://localhost:3100' )
  } )

  it.each( [
    [ 'an unknown host', { host: 'evil.test' } ],
    [ 'a wrong port', { host: 'localhost:9999' } ],
    [ 'no Host header', {} ],
  ] )( 'throws UnknownOriginError for %s', ( _name, headers ) => {
    expect( () => requestOrigin( buildRequest( { headers } ), ORIGINS ) )
      .toThrow( UnknownOriginError )
  } )

  it( 'names APP_ORIGINS in the error message', () => {
    expect( () => requestOrigin( buildRequest( { headers: { host: 'evil.test' } } ), ORIGINS ) )
      .toThrow( 'This address isn\'t configured in APP_ORIGINS' )
  } )
} )

describe( 'requestScheme', () => {
  it( 'is http for a plain socket and https for a TLS one', () => {
    expect( requestScheme( buildRequest( {} ) ) ).toBe( 'http' )
    expect( requestScheme( buildRequest( { encrypted: true } ) ) ).toBe( 'https' )
  } )

  it( 'believes X-Forwarded-Proto from loopback only', () => {
    const headers = { 'x-forwarded-proto': 'https' }

    expect( requestScheme( buildRequest( { headers } ) ) ).toBe( 'https' )
    expect( requestScheme( buildRequest( { peer: '100.64.0.7', headers } ) ) ).toBe( 'http' )
  } )

  it( 'ignores a forwarded scheme that is neither http nor https', () => {
    expect( requestScheme( buildRequest( { headers: { 'x-forwarded-proto': 'gopher' } } ) ) )
      .toBe( 'http' )
  } )
} )
