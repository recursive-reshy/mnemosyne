// Express
import type { Request, RequestHandler } from 'express'
// Logging
import { logger } from '../logger.js'
import type { Logger } from 'pino'

// Polled every few seconds by Docker and the web app; logging them would drown the rest
const SKIPPED_PATHS = new Set( [ '/api/health', '/api/status' ] )
const SERVER_ERROR = 500

// The pattern the router matched, so `/api/jobs/:id` and not one line shape per job ID
const routeOf = ( req: Request, path: string ): string => {
  const pattern = req.route as { path?: unknown } | undefined

  return typeof pattern?.path === 'string' ? `${ req.baseUrl }${ pattern.path }` : path
}

// Never logs the query string, headers or body
export const createRequestLog = ( log: Logger ): RequestHandler => ( req, res, next ) => {
  const path = `${ req.baseUrl }${ req.path }`

  if( SKIPPED_PATHS.has( path ) ) {
    next()

    return
  }

  const started = process.hrtime.bigint()

  res.on( 'finish', () => {
    const fields = {
      method: req.method,
      route: routeOf( req, path ),
      status: res.statusCode,
      duration_ms: Math.round( Number( process.hrtime.bigint() - started ) / 1e4 ) / 100,
    }

    if( res.statusCode >= SERVER_ERROR ) {
      log.error( fields, 'Request' )
    } else {
      log.info( fields, 'Request' )
    }
  } )

  next()
}

export const requestLog: RequestHandler = createRequestLog( logger )
