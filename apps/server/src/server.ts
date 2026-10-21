// Packages
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
// App
import { app } from './app.js'
// Clients
import { assertVaultWritable, resolveFolder } from './clients/vault.client.js'
// Config
import { config } from './config.js'
// Logging
import { logger } from './logger.js'
// Repositories
import { closeDatabase, openDatabase } from './repositories/database.js'
// Services
import { recoverInterruptedJobs } from './services/jobs.service.js'
// Shutdown
import { SHUTDOWN_TIMEOUT_MS, createShutdown } from './shutdown.js'
// Worker
import { startIntakePoller } from './worker/intakePoller.js'
import { startSweeper } from './worker/sweeper.js'
import { startWorker } from './worker/worker.js'

// Audio is deleted when a job ends, so anything left here belongs to a job cut short by a shutdown.
await rm( config.workDir, { recursive: true, force: true } )

try {
  await assertVaultWritable( config.vaultPath )
  await resolveFolder( config.vaultPath, config.defaultNoteFolder )
} catch( error ) {
  logger.error( { err: error }, 'The vault is not ready' )
  process.exit( 1 )
}

await mkdir( config.dataDir, { recursive: true } )
openDatabase( join( config.dataDir, 'mnemosyne.db' ) )

const interrupted = recoverInterruptedJobs()

if( interrupted > 0 ) {
  logger.info( { interrupted }, 'Marked interrupted jobs as failed' )
}

const stopSweeper = startSweeper()
const stopWorker = startWorker()
const stopIntakePoller = startIntakePoller()

const server = app.listen( config.port, () => {
  logger.info( { port: config.port }, 'Server listening' )
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
  stopIntakePoller,
  timeoutMs: SHUTDOWN_TIMEOUT_MS,
  exit: ( code ) => process.exit( code ),
  log: ( message ) => logger.info( message ),
} )

process.on( 'SIGTERM', () => void shutdown( 'SIGTERM' ) )
process.on( 'SIGINT', () => void shutdown( 'SIGINT' ) )
