// Express
import type { RequestHandler } from 'express'
// Errors
import { UnsupportedMediaTypeError } from '../errors.js'

const CHECKED = new Set( [ 'POST', 'PUT', 'PATCH', 'DELETE' ] )

// With cookies, a form on another site could send a state-changing request; it can't send JSON
// without a CORS preflight, so refusing everything else closes that door (ADR 0061).
export const jsonOnly: RequestHandler = ( req, _res, next ) => {
  const type = ( req.headers[ 'content-type' ] ?? '' ).split( ';' )[ 0 ]?.trim().toLowerCase()

  if( CHECKED.has( req.method ) && type !== 'application/json' ) {
    throw new UnsupportedMediaTypeError()
  }

  next()
}
