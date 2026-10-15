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
import { deleteExpiredJobs } from '../services/jobs.service.js'
// Worker
import { startSweeper } from './sweeper.js'

vi.mock( '../services/jobs.service.js' )
vi.mock( '../config.js', () => ( { config: { cleanupIntervalMinutes: 15 } } ) )

const deleteMock = vi.mocked( deleteExpiredJobs )
const INTERVAL_MS = 15 * 60_000

beforeEach( () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  deleteMock.mockReturnValue( 0 )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startSweeper', () => {
  it( 'sweeps once at start', () => {
    const stop = startSweeper()

    expect( deleteMock ).toHaveBeenCalledTimes( 1 )

    stop()
  } )

  it( 'sweeps again every interval', async () => {
    const stop = startSweeper()

    await vi.advanceTimersByTimeAsync( INTERVAL_MS - 1 )
    expect( deleteMock ).toHaveBeenCalledTimes( 1 )

    await vi.advanceTimersByTimeAsync( 1 )
    expect( deleteMock ).toHaveBeenCalledTimes( 2 )

    await vi.advanceTimersByTimeAsync( INTERVAL_MS )
    expect( deleteMock ).toHaveBeenCalledTimes( 3 )

    stop()
  } )

  it( 'stops sweeping once stopped', async () => {
    const stop = startSweeper()
    stop()

    await vi.advanceTimersByTimeAsync( INTERVAL_MS * 3 )

    expect( deleteMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'logs how many jobs it deleted when there were some', () => {
    const logSpy = vi.spyOn( console, 'log' ).mockImplementation( () => undefined )
    deleteMock.mockReturnValue( 2 )

    startSweeper()()

    expect( logSpy ).toHaveBeenCalledWith( 'Deleted 2 expired job(s)' )
  } )

  it( 'stays quiet when nothing expired', () => {
    const logSpy = vi.spyOn( console, 'log' ).mockImplementation( () => undefined )

    startSweeper()()

    expect( logSpy ).not.toHaveBeenCalled()
  } )

  it( 'keeps running after a sweep throws', async () => {
    const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
    deleteMock.mockImplementationOnce( () => {
      throw new Error( 'db locked' )
    } )

    const stop = startSweeper()
    await vi.advanceTimersByTimeAsync( INTERVAL_MS )

    expect( errorSpy ).toHaveBeenCalled()
    expect( deleteMock ).toHaveBeenCalledTimes( 2 )

    stop()
  } )
} )
