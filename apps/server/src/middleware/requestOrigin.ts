// Express
import type { Request } from 'express'
// Config
import { config } from '../config.js'
// Errors
import { UnknownOriginError } from '../errors.js'

const LOOPBACK = new Set( [ '127.0.0.1', '::1', '::ffff:127.0.0.1' ] )

const firstValue = ( header: string | string[] | undefined ): string | undefined => {
  const value = Array.isArray( header ) ? header[ 0 ] : header
  const first = value?.split( ',' )[ 0 ]?.trim()

  return first === undefined || first === '' ? undefined : first
}

// Forwarded headers are only believed from a loopback peer, where Tailscale Serve and a browser on
// the Mac connect from; anyone else could send them. The answer is always one of `origins`.
export const requestOrigin = ( req: Request, origins: string[] ): string => {
  const loopback = LOOPBACK.has( req.socket.remoteAddress ?? '' )
  const forwardedHost = loopback ? firstValue( req.headers[ 'x-forwarded-host' ] ) : undefined
  const forwardedProto = loopback ? firstValue( req.headers[ 'x-forwarded-proto' ] ) : undefined
  const socketScheme = 'encrypted' in req.socket && req.socket.encrypted === true ? 'https' : 'http'
  const host = ( forwardedHost ?? firstValue( req.headers.host ) )?.toLowerCase()
  const scheme = forwardedProto?.toLowerCase() ?? socketScheme

  if( host !== undefined ) {
    // Tailscale Serve may pass Host unchanged with no forwarded headers; its address is https
    const candidates = loopback && forwardedHost === undefined
      ? [ `${ scheme }://${ host }`, `https://${ host }` ]
      : [ `${ scheme }://${ host }` ]

    for( const candidate of candidates ) {
      const match = origins.find( ( origin ) => origin.toLowerCase() === candidate )

      if( match !== undefined ) {
        return match
      }
    }
  }

  throw new UnknownOriginError()
}

export const currentOrigin = ( req: Request ): string => requestOrigin( req, config.appOrigins )
