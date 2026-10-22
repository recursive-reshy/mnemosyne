// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Logging
import { logger } from '../logger.js'
// Services
import { runServiceChecks } from '../services/health.service.js'
// Worker
import { startServiceMonitor } from './serviceMonitor.js'

const configMock = vi.hoisted( () => ( { statusCheckIntervalMinutes: 2, logLevel: 'silent' } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../services/health.service.js', () => ( { runServiceChecks: vi.fn() } ) )

const MINUTE_MS = 60_000

beforeEach( () => {
  vi.useFakeTimers()
  configMock.statusCheckIntervalMinutes = 2
  vi.mocked( runServiceChecks ).mockReset()
  vi.mocked( runServiceChecks ).mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startServiceMonitor', () => {
  it( 'checks once at the start and then every configured interval', async () => {
    const stop = startServiceMonitor()

    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )

    await vi.advanceTimersByTimeAsync( 2 * MINUTE_MS - 1 )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )

    await vi.advanceTimersByTimeAsync( 1 )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 2 )

    await vi.advanceTimersByTimeAsync( 2 * MINUTE_MS )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 3 )

    await stop()
  } )

  it( 'uses STATUS_CHECK_INTERVAL_MINUTES', async () => {
    configMock.statusCheckIntervalMinutes = 5

    const stop = startServiceMonitor()

    await vi.advanceTimersByTimeAsync( 4 * MINUTE_MS )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )

    await vi.advanceTimersByTimeAsync( MINUTE_MS )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 2 )

    await stop()
  } )

  it( 'keeps going after a check throws, and logs it', async () => {
    const error = vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    vi.mocked( runServiceChecks ).mockRejectedValueOnce( new Error( 'boom' ) )

    const stop = startServiceMonitor()

    await vi.advanceTimersByTimeAsync( 2 * MINUTE_MS )

    expect( runServiceChecks ).toHaveBeenCalledTimes( 2 )
    expect( error ).toHaveBeenCalledTimes( 1 )
    expect( error.mock.calls[ 0 ]?.[ 1 ] ).toBe( 'Service check failed' )

    await stop()
  } )

  it( 'does not start a check while the last one is still running', async () => {
    let finish: () => void = () => undefined

    vi.mocked( runServiceChecks ).mockReturnValueOnce( new Promise< void >( ( resolve ) => {
      finish = resolve
    } ) )

    const stop = startServiceMonitor()

    await vi.advanceTimersByTimeAsync( 4 * MINUTE_MS )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )

    finish()
    await vi.advanceTimersByTimeAsync( 2 * MINUTE_MS )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 2 )

    await stop()
  } )

  it( 'stops the timer and waits for a running check', async () => {
    let finish: () => void = () => undefined

    vi.mocked( runServiceChecks ).mockReturnValueOnce( new Promise< void >( ( resolve ) => {
      finish = resolve
    } ) )

    const stop = startServiceMonitor()
    let stopped = false
    const stopping = stop().then( () => {
      stopped = true
    } )

    await vi.advanceTimersByTimeAsync( 10 )
    expect( stopped ).toBe( false )

    finish()
    await stopping
    await vi.advanceTimersByTimeAsync( 10 * MINUTE_MS )

    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )
  } )
} )
