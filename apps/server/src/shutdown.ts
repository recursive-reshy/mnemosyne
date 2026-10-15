export const SHUTDOWN_TIMEOUT_MS = 60_000

interface ShutdownOptions {
  stopWorker: () => Promise< void >
  closeServer: () => Promise< void >
  closeStore: () => void
  stopSweeper: () => void
  timeoutMs: number
  exit: ( code: number ) => void
  log: ( message: string ) => void
}

export const createShutdown = (
  { stopWorker, closeServer, closeStore, stopSweeper, timeoutMs, exit, log }: ShutdownOptions,
): ( ( signal: string ) => Promise< void > ) => {
  let shuttingDown = false

  return async ( signal ) => {
    if( shuttingDown ) {
      log( `Received ${ signal } again, exiting now` )
      exit( 1 )

      return
    }

    shuttingDown = true
    log( `Received ${ signal }, shutting down…` )
    stopSweeper()

    let timer: ReturnType< typeof setTimeout > | undefined
    const timeout = new Promise< 'timeout' >( ( resolve ) => {
      timer = setTimeout( () => resolve( 'timeout' ), timeoutMs )
    } )
    const stopped = Promise.all( [ closeServer(), stopWorker() ] ).then( () => 'stopped' as const )

    try {
      const outcome = await Promise.race( [ stopped, timeout ] )

      if( outcome === 'timeout' ) {
        log( `Shutdown timed out after ${ timeoutMs / 1000 } s; exiting` )
        exit( 1 )
      } else {
        closeStore()
        log( 'Shutdown complete' )
        exit( 0 )
      }
    } catch( error ) {
      log( error instanceof Error ? error.message : 'Unknown error' )
      exit( 1 )
    } finally {
      clearTimeout( timer )
    }
  }
}
