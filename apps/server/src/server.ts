// Packages
import { rm } from 'node:fs/promises'
// App
import { app } from './app.js'
// Config
import { config } from './config.js'
// Shutdown
import { SHUTDOWN_TIMEOUT_MS, createShutdown } from './shutdown.js'
// Worker
import { startWorker } from './worker/worker.js'

// Jobs live in memory, so anything left here belongs to a job lost in the last shutdown.
await rm( config.workDir, { recursive: true, force: true } )

const stopWorker = startWorker()

const server = app.listen( config.port, () => {
  console.log( `Mnemosyne server listening on http://localhost:${ config.port }` )
} )

const closeServer = (): Promise< void > => new Promise( ( resolve, reject ) => {
  server.close( ( error ) => error ? reject( error ) : resolve() )
  server.closeIdleConnections()
} )

const shutdown = createShutdown( {
  stopWorker,
  closeServer,
  timeoutMs: SHUTDOWN_TIMEOUT_MS,
  exit: ( code ) => process.exit( code ),
  log: ( message ) => console.log( message ),
} )

process.on( 'SIGTERM', () => void shutdown( 'SIGTERM' ) )
process.on( 'SIGINT', () => void shutdown( 'SIGINT' ) )
