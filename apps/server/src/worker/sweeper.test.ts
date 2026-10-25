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
import { sweepSessions } from '../services/session.service.js'
// Worker
import { startSweeper } from './sweeper.js'
// Logging
import { logger } from '../logger.js'

vi.mock( '../services/jobs.service.js' )
vi.mock( '../services/session.service.js' )
vi.mock( '../config.js', () => ( { config: { cleanupIntervalMinutes: 15, logLevel: 'silent' } } ) )

const deleteMock = vi.mocked( deleteExpiredJobs )
const sessionsMock = vi.mocked( sweepSessions )
const INTERVAL_MS = 15 * 60_000

beforeEach( () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  deleteMock.mockReturnValue( 0 )
  sessionsMock.mockReturnValue( 0 )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startSweeper', () => {
  it( 'also deletes expired sessions on every sweep', async () => {
    const stop = startSweeper()

    expect( sessionsMock ).toHaveBeenCalledTimes( 1 )
    expect( sessionsMock.mock.calls[ 0 ]?.[ 0 ] ).toBeInstanceOf( Date )

    await vi.advanceTimersByTimeAsync( INTERVAL_MS )
    expect( sessionsMock ).toHaveBeenCalledTimes( 2 )

    stop()
  } )

  it( 'still sweeps sessions when the job sweep throws, and the other way round', () => {
    deleteMock.mockImplementation( () => {
      throw new Error( 'boom' )
    } )

    const stop = startSweeper()

    expect( sessionsMock ).toHaveBeenCalledTimes( 1 )

    stop()
  } )

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
    const logSpy = vi.spyOn( logger, 'info' ).mockImplementation( () => undefined )
    deleteMock.mockReturnValue( 2 )

    startSweeper()()

    expect( logSpy ).toHaveBeenCalledWith( { deleted: 2 }, 'Deleted expired jobs' )
  } )

  it( 'stays quiet when nothing expired', () => {
    const logSpy = vi.spyOn( logger, 'info' ).mockImplementation( () => undefined )

    startSweeper()()

    expect( logSpy ).not.toHaveBeenCalled()
  } )

  it( 'keeps running after a sweep throws', async () => {
    const errorSpy = vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
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
