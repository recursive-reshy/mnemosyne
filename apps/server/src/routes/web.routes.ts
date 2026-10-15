// Node
import path from 'node:path'
// Express
import express, { Router } from 'express'

const IMMUTABLE = 'public, max-age=31536000, immutable'
const NO_CACHE = 'no-cache'

export const webRoutes = ( webDir: string ): Router => {
  const root = path.resolve( webDir )
  const assetsDir = path.join( root, 'assets' ) + path.sep
  const router = Router()

  router.use( express.static( root, {
    index: 'index.html',
    setHeaders: ( res, filePath ) => {
      if( path.basename( filePath ) === 'index.html' ) {
        res.setHeader( 'Cache-Control', NO_CACHE )
      } else if( filePath.startsWith( assetsDir ) ) {
        res.setHeader( 'Cache-Control', IMMUTABLE )
      }
    },
  } ) )

  // A path without an extension is a client-side route; a missing file must stay a 404.
  router.use( ( { method, path: requestPath }, res, next ) => {
    if( method !== 'GET' || path.extname( requestPath ) !== '' ) {
      next()
      return
    }

    res.sendFile( 'index.html', { root, headers: { 'Cache-Control': NO_CACHE } } )
  } )

  return router
}
