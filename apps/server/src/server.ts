// Packages
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
// App
import { app } from './app.js'
// Config
import { config } from './config.js'
// Repositories
import { closeJobStore, openJobStore } from './repositories/jobStore.repository.js'
// Shutdown
import { SHUTDOWN_TIMEOUT_MS, createShutdown } from './shutdown.js'
// Worker
import { startWorker } from './worker/worker.js'

// Audio is deleted when a job ends, so anything left here belongs to a job cut short by a shutdown.
await rm( config.workDir, { recursive: true, force: true } )

await mkdir( config.dataDir, { recursive: true } )
openJobStore( join( config.dataDir, 'mnemosyne.db' ) )

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
  closeStore: closeJobStore,
  timeoutMs: SHUTDOWN_TIMEOUT_MS,
  exit: ( code ) => process.exit( code ),
  log: ( message ) => console.log( message ),
} )

process.on( 'SIGTERM', () => void shutdown( 'SIGTERM' ) )
process.on( 'SIGINT', () => void shutdown( 'SIGINT' ) )
