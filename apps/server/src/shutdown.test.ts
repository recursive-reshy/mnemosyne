// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shutdown
import { SHUTDOWN_TIMEOUT_MS, createShutdown } from './shutdown.js'

const TIMEOUT_MS = 1000

let events: string[]
let exit: ReturnType< typeof vi.fn< ( code: number ) => void > >
let stopWorker: ReturnType< typeof vi.fn< () => Promise< void > > >
let closeServer: ReturnType< typeof vi.fn< () => Promise< void > > >
let closeStore: ReturnType< typeof vi.fn< () => void > >
let stopSweeper: ReturnType< typeof vi.fn< () => void > >

const build = (): ( signal: string ) => Promise< void > => createShutdown( {
  stopWorker,
  closeServer,
  closeStore,
  stopSweeper,
  timeoutMs: TIMEOUT_MS,
  exit,
  log: ( message ) => events.push( `log:${ message }` ),
} )

beforeEach( () => {
  vi.useFakeTimers()
  events = []
  exit = vi.fn( ( code: number ) => {
    events.push( `exit:${ code }` )
  } )
  stopWorker = vi.fn( () => Promise.resolve() )
  closeServer = vi.fn( () => Promise.resolve() )
  stopSweeper = vi.fn()
  closeStore = vi.fn( () => {
    events.push( 'closeStore' )
  } )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'SHUTDOWN_TIMEOUT_MS', () => {
  it( 'is 60 seconds', () => {
    expect( SHUTDOWN_TIMEOUT_MS ).toBe( 60_000 )
  } )
} )

describe( 'createShutdown', () => {
  it( 'logs, then exits 0 once both the server and the worker have stopped', async () => {
    const shutdown = build()

    await shutdown( 'SIGTERM' )

    expect( events ).toEqual( [
      'log:Received SIGTERM, shutting down…',
      'closeStore',
      'log:Shutdown complete',
      'exit:0',
    ] )
    expect( exit ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'stops the sweeper before stopping the worker and the server', async () => {
    const shutdown = build()

    await shutdown( 'SIGTERM' )

    expect( stopSweeper ).toHaveBeenCalledTimes( 1 )
    expect( stopSweeper.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
      stopWorker.mock.invocationCallOrder[ 0 ] ?? 0,
    )
    expect( stopSweeper.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
      closeServer.mock.invocationCallOrder[ 0 ] ?? 0,
    )
  } )

  it( 'closes the store only after the worker and the server have stopped', async () => {
    let finishWorker: () => void = () => undefined
    stopWorker.mockReturnValue( new Promise< void >( ( resolve ) => {
      finishWorker = resolve
    } ) )
    const shutdown = build()

    const done = shutdown( 'SIGTERM' )
    await vi.advanceTimersByTimeAsync( 10 )
    expect( closeStore ).not.toHaveBeenCalled()

    finishWorker()
    await done

    expect( closeStore ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'logs the message and exits 1 when closeStore throws', async () => {
    closeStore.mockImplementation( () => {
      throw new Error( 'store busy' )
    } )
    const shutdown = build()

    await shutdown( 'SIGTERM' )

    expect( events ).toEqual( [
      'log:Received SIGTERM, shutting down…',
      'log:store busy',
      'exit:1',
    ] )
  } )

  it( 'does not close the store when shutdown times out', async () => {
    stopWorker.mockReturnValue( new Promise< void >( () => undefined ) )
    const shutdown = build()

    void shutdown( 'SIGTERM' )
    await vi.advanceTimersByTimeAsync( TIMEOUT_MS )

    expect( closeStore ).not.toHaveBeenCalled()
  } )

  it( 'exits 1 after exactly the timeout when the worker is still busy', async () => {
    stopWorker.mockReturnValue( new Promise< void >( () => undefined ) )
    const shutdown = build()

    void shutdown( 'SIGTERM' )
    await vi.advanceTimersByTimeAsync( TIMEOUT_MS - 1 )
    expect( exit ).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync( 1 )

    expect( events ).toEqual( [
      'log:Received SIGTERM, shutting down…',
      'log:Shutdown timed out after 1 s; exiting',
      'exit:1',
    ] )
  } )

  it( 'logs the message and exits 1 when closeServer rejects', async () => {
    closeServer.mockRejectedValue( new Error( 'close failed' ) )
    const shutdown = build()

    await shutdown( 'SIGINT' )

    expect( events ).toEqual( [
      'log:Received SIGINT, shutting down…',
      'log:close failed',
      'exit:1',
    ] )
  } )

  it( 'exits 1 straight away on a second signal during shutdown', async () => {
    stopWorker.mockReturnValue( new Promise< void >( () => undefined ) )
    const shutdown = build()

    void shutdown( 'SIGTERM' )
    await vi.advanceTimersByTimeAsync( 10 )
    await shutdown( 'SIGINT' )

    expect( events ).toEqual( [
      'log:Received SIGTERM, shutting down…',
      'log:Received SIGINT again, exiting now',
      'exit:1',
    ] )
  } )

  it( 'calls stopWorker and closeServer on the first signal', async () => {
    const shutdown = build()

    await shutdown( 'SIGTERM' )

    expect( stopWorker ).toHaveBeenCalledTimes( 1 )
    expect( closeServer ).toHaveBeenCalledTimes( 1 )
  } )
} )
