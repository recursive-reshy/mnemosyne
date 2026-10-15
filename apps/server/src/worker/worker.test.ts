// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Services
import {
  failJob,
  findJob,
  markStatus,
  queueJob,
} from '../services/jobs.service.js'
// Repositories
import { clearJobs } from '../repositories/jobStore.repository.js'
// Worker
import { runJob } from './runJob.js'
import { startWorker } from './worker.js'

vi.mock( './runJob.js' )

const runJobMock = vi.mocked( runJob )

let events: string[]
let gates: Map< string, () => void >
let hold: boolean
let stopWorker: () => Promise< void >

const useRealisticRunJob = (): void => {
  runJobMock.mockImplementation( async ( id ) => {
    markStatus( id, 'downloading' )
    events.push( `start:${ id }` )

    if( hold ) {
      await new Promise< void >( ( resolve ) => gates.set( id, resolve ) )
    }

    failJob( id, 'x' )
    events.push( `end:${ id }` )
  } )
}

const queue = (): string => {
  return queueJob( 'https://example.com/video' ).id
}

beforeEach( () => {
  vi.useFakeTimers()
  clearJobs()
  vi.resetAllMocks()
  events = []
  gates = new Map()
  hold = false
  stopWorker = () => Promise.resolve()
  useRealisticRunJob()
} )

afterEach( async () => {
  gates.forEach( ( release ) => release() )
  await stopWorker()
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startWorker', () => {
  it( 'runs a queued job immediately', async () => {
    const id = queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( runJobMock ).toHaveBeenCalledWith( id )
  } )

  it( 'runs queued jobs oldest first', async () => {
    const first = queue()
    const second = queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ first }`,
      `end:${ first }`,
      `start:${ second }`,
      `end:${ second }`,
    ] )
  } )

  it( 'never runs two jobs at once', async () => {
    hold = true
    const first = queue()
    const second = queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( runJobMock ).toHaveBeenCalledTimes( 1 )
    expect( events ).toEqual( [ `start:${ first }` ] )

    hold = false
    gates.get( first )?.()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ first }`,
      `end:${ first }`,
      `start:${ second }`,
      `end:${ second }`,
    ] )
  } )

  it( 'picks up jobs queued after it started', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( runJobMock ).not.toHaveBeenCalled()

    const id = queue()
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( runJobMock ).toHaveBeenCalledWith( id )
  } )

  it( 'runs a job queued during a run in the same pass', async () => {
    hold = true
    const first = queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    const second = queue()

    hold = false
    gates.get( first )?.()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toContain( `end:${ second }` )
  } )

  it( 'keeps going after a job throws', async () => {
    const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
    const broken = queue()
    runJobMock.mockRejectedValueOnce( new Error( 'broken' ) )

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( errorSpy ).toHaveBeenCalled()

    markStatus( broken, 'downloading' )
    const later = queue()
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( runJobMock ).toHaveBeenCalledWith( later )
  } )

  it( 'makes one call per pass when a job stays queued', async () => {
    vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
    const id = queue()
    runJobMock.mockRejectedValue( new Error( 'broken' ) )

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( runJobMock ).toHaveBeenCalledTimes( 1 )

    await vi.advanceTimersByTimeAsync( 1000 )

    expect( runJobMock ).toHaveBeenCalledTimes( 2 )
    expect( findJob( id ).status ).toBe( 'queued' )
  } )

  it( 'stops polling after the stop function is called', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    await stopWorker()
    queue()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( runJobMock ).not.toHaveBeenCalled()
  } )

  it( 'resolves the stop promise at once when idle', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    await expect( stopWorker() ).resolves.toBeUndefined()
  } )

  it( 'resolves the stop promise only after the running job finishes', async () => {
    hold = true
    const id = queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    let stopped = false
    const stopping = stopWorker().then( () => {
      stopped = true
    } )
    await vi.advanceTimersByTimeAsync( 5000 )
    expect( stopped ).toBe( false )

    gates.get( id )?.()
    await stopping

    expect( stopped ).toBe( true )
  } )

  it( 'does not run the next job once stopped', async () => {
    hold = true
    const first = queue()
    queue()

    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    const stopping = stopWorker()
    gates.get( first )?.()
    await stopping
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( events ).toEqual( [ `start:${ first }`, `end:${ first }` ] )
  } )

  it( 'is safe to stop twice', async () => {
    stopWorker = startWorker()
    await vi.advanceTimersByTimeAsync( 0 )

    await stopWorker()

    await expect( stopWorker() ).resolves.toBeUndefined()
  } )
} )
