// Express
import type { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Middleware
import { parseCookies } from '../middleware/auth.js'
import { currentOrigin, requestScheme } from '../middleware/requestOrigin.js'
// Services
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE_MS,
  beginSignIn,
  completeSignIn,
} from '../services/auth.service.js'
import {
  SESSION_COOKIE,
  cookieOptions,
  endSession,
} from '../services/session.service.js'

const OAUTH_COOKIE_PATH = '/api/auth'

const StartQuery = z.object( { returnTo: z.string().optional() } )
const CallbackQuery = z.object( {
  code: z.string().optional(),
  state: z.string().optional(),
} )

export const startSignIn = ( req: Request, res: Response ): void => {
  const { returnTo } = StartQuery.parse( req.query )
  const origin = currentOrigin( req )
  const { url, cookie } = beginSignIn( { origin, returnTo, now: new Date() } )

  res.cookie( OAUTH_COOKIE, cookie, {
    httpOnly: true,
    sameSite: 'lax',
    path: OAUTH_COOKIE_PATH,
    secure: requestScheme( req ) === 'https',
    maxAge: OAUTH_COOKIE_MAX_AGE_MS,
  } )
  res.redirect( 302, url )
}

export const finishSignIn = async ( req: Request, res: Response ): Promise< void > => {
  const { code, state } = CallbackQuery.parse( req.query )
  const origin = currentOrigin( req )
  const result = await completeSignIn( {
    origin,
    code,
    state,
    cookie: parseCookies( req.headers.cookie )[ OAUTH_COOKIE ],
    now: new Date(),
  } )

  res.clearCookie( OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH } )

  if( !result.ok ) {
    res.redirect( 302, `/signin?error=${ result.error }` )

    return
  }

  res.cookie( SESSION_COOKIE, result.token, cookieOptions( requestScheme( req ) === 'https' ) )
  res.redirect( 302, result.returnTo )
}

export const signOut = ( req: Request, res: Response ): void => {
  endSession( parseCookies( req.headers.cookie )[ SESSION_COOKIE ] )
  res.clearCookie( SESSION_COOKIE, { path: '/' } )
  res.status( 204 ).end()
}
