// Packages
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
// App
import { app } from './app.js'
// Clients
import { assertVaultWritable, resolveFolder } from './clients/vault.client.js'
// Config
import { config } from './config.js'
// Repositories
import { closeDatabase, openDatabase } from './repositories/database.js'
// Services
import { recoverInterruptedJobs } from './services/jobs.service.js'
// Shutdown
import { SHUTDOWN_TIMEOUT_MS, createShutdown } from './shutdown.js'
// Worker
import { startFeedPoller } from './worker/feedPoller.js'
import { startSweeper } from './worker/sweeper.js'
import { startWorker } from './worker/worker.js'

// Audio is deleted when a job ends, so anything left here belongs to a job cut short by a shutdown.
await rm( config.workDir, { recursive: true, force: true } )

try {
  await assertVaultWritable( config.vaultPath )
  await resolveFolder( config.vaultPath, config.defaultNoteFolder )
} catch( error ) {
  console.error( error instanceof Error ? error.message : error )
  process.exit( 1 )
}

await mkdir( config.dataDir, { recursive: true } )
openDatabase( join( config.dataDir, 'mnemosyne.db' ) )

const interrupted = recoverInterruptedJobs()

if( interrupted > 0 ) {
  console.log( `Marked ${ interrupted } interrupted job(s) as failed` )
}

const stopSweeper = startSweeper()
const stopWorker = startWorker()
const stopFeedPoller = startFeedPoller()

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
  closeStore: closeDatabase,
  stopSweeper,
  stopFeedPoller,
  timeoutMs: SHUTDOWN_TIMEOUT_MS,
  exit: ( code ) => process.exit( code ),
  log: ( message ) => console.log( message ),
} )

process.on( 'SIGTERM', () => void shutdown( 'SIGTERM' ) )
process.on( 'SIGINT', () => void shutdown( 'SIGINT' ) )
