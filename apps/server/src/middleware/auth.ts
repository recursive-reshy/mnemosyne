// Express
import type { Request, RequestHandler } from 'express'
// Errors
import { NotFoundError, UnauthenticatedError } from '../errors.js'
// Logging
import { withLogContext } from '../logContext.js'
// Middleware
import { requestScheme } from './requestOrigin.js'
// Services
import { SESSION_COOKIE, cookieOptions, resolveSession } from '../services/session.service.js'
import type { SessionUser } from '../services/session.service.js'

// Express's Request type can't be extended without a namespace (erasable syntax only), so the
// signed-in user is kept beside the request and read with `currentUser`
const users = new WeakMap< Request, SessionUser >()

const decode = ( value: string ): string => {
  try {
    return decodeURIComponent( value )
  } catch{
    return value
  }
}

// A small parser instead of a dependency: names are the text before the first `=`
export const parseCookies = ( header: string | undefined ): Record< string, string > => {
  const cookies: Record< string, string > = {}

  for( const pair of ( header ?? '' ).split( ';' ) ) {
    const at = pair.indexOf( '=' )
    const name = at > 0 ? pair.slice( 0, at ).trim() : ''

    if( name !== '' ) {
      cookies[ name ] = decode( pair.slice( at + 1 ).trim() )
    }
  }

  return cookies
}

export const requireUser: RequestHandler = ( req, res, next ) => {
  const token = parseCookies( req.headers.cookie )[ SESSION_COOKIE ]
  const resolved = resolveSession( token, new Date() )

  if( resolved === null ) {
    res.clearCookie( SESSION_COOKIE, { path: '/' } )

    throw new UnauthenticatedError()
  }

  if( resolved.refreshed && token !== undefined ) {
    res.cookie( SESSION_COOKIE, token, cookieOptions( requestScheme( req ) === 'https' ) )
  }

  users.set( req, resolved.user )

  withLogContext( { user_id: resolved.user.id }, next )
}

// A member gets the same 404 as for a route that doesn't exist (ADR 0062)
export const requireAdmin: RequestHandler = ( req, _res, next ) => {
  if( users.get( req )?.role !== 'admin' ) {
    throw new NotFoundError( 'Not Found' )
  }

  next()
}

export const currentUser = ( req: Request ): SessionUser => {
  const user = users.get( req )

  if( user === undefined ) {
    throw new Error( 'No signed-in user on this request' )
  }

  return user
}
