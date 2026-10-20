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
import { checkDueFeeds } from '../services/feeds.service.js'
import { checkDueSources } from '../services/gmailSources.service.js'
// Worker
import { startIntakePoller } from './intakePoller.js'

vi.mock( '../services/feeds.service.js' )
vi.mock( '../services/gmailSources.service.js' )

const checkMock = vi.mocked( checkDueFeeds )
const sourcesMock = vi.mocked( checkDueSources )
const TICK_MS = 60_000

let stop: () => Promise< void >

beforeEach( () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  checkMock.mockResolvedValue( 0 )
  sourcesMock.mockResolvedValue( 0 )
  stop = () => Promise.resolve()
} )

afterEach( async () => {
  await stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startIntakePoller', () => {
  it( 'does not check at start, only at the first tick', async () => {
    stop = startIntakePoller()

    expect( checkMock ).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync( TICK_MS - 1 )

    expect( checkMock ).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync( 1 )

    expect( checkMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'checks again on every tick', async () => {
    stop = startIntakePoller()

    await vi.advanceTimersByTimeAsync( TICK_MS * 3 )

    expect( checkMock ).toHaveBeenCalledTimes( 3 )
  } )

  it( 'asks for the due feeds on every tick, so a changed interval setting applies', async () => {
    const calls: number[] = []
    checkMock.mockImplementation( () => {
      calls.push( calls.length )

      return Promise.resolve( 0 )
    } )
    stop = startIntakePoller()

    await vi.advanceTimersByTimeAsync( TICK_MS * 2 )

    expect( calls ).toEqual( [ 0, 1 ] )
  } )

  it( 'never runs two passes at once', async () => {
    let release: () => void = () => undefined
    checkMock.mockImplementation( () => new Promise< number >( ( resolve ) => {
      release = () => resolve( 1 )
    } ) )
    stop = startIntakePoller()

    await vi.advanceTimersByTimeAsync( TICK_MS * 3 )

    expect( checkMock ).toHaveBeenCalledTimes( 1 )

    release()
    await vi.advanceTimersByTimeAsync( TICK_MS )

    expect( checkMock ).toHaveBeenCalledTimes( 2 )

    release()
  } )

  it( 'keeps going after a pass fails, and logs it', async () => {
    const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
    checkMock.mockRejectedValueOnce( new Error( 'boom' ) )
    stop = startIntakePoller()

    await vi.advanceTimersByTimeAsync( TICK_MS * 2 )

    expect( checkMock ).toHaveBeenCalledTimes( 2 )
    expect( errorSpy ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'logs how many feeds were checked when there were some', async () => {
    const logSpy = vi.spyOn( console, 'log' ).mockImplementation( () => undefined )
    checkMock.mockResolvedValueOnce( 2 )
    stop = startIntakePoller()

    await vi.advanceTimersByTimeAsync( TICK_MS )

    expect( logSpy ).toHaveBeenCalledWith( 'Checked 2 feed(s)' )
  } )

  describe( 'Gmail sources', () => {
    it( 'checks the due sources after the feeds on every tick', async () => {
      const order: string[] = []
      checkMock.mockImplementation( () => {
        order.push( 'feeds' )

        return Promise.resolve( 0 )
      } )
      sourcesMock.mockImplementation( () => {
        order.push( 'sources' )

        return Promise.resolve( 0 )
      } )
      stop = startIntakePoller()

      await vi.advanceTimersByTimeAsync( TICK_MS * 2 )

      expect( order ).toEqual( [ 'feeds', 'sources', 'feeds', 'sources' ] )
    } )

    it( 'still checks the sources when the feeds fail, and logs the failure', async () => {
      const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
      checkMock.mockRejectedValueOnce( new Error( 'feeds down' ) )
      stop = startIntakePoller()

      await vi.advanceTimersByTimeAsync( TICK_MS )

      expect( sourcesMock ).toHaveBeenCalledTimes( 1 )
      expect( errorSpy ).toHaveBeenCalledTimes( 1 )
    } )

    it( 'keeps checking feeds when the sources fail, and logs the failure', async () => {
      const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
      sourcesMock.mockRejectedValueOnce( new Error( 'gmail down' ) )
      stop = startIntakePoller()

      await vi.advanceTimersByTimeAsync( TICK_MS * 2 )

      expect( checkMock ).toHaveBeenCalledTimes( 2 )
      expect( sourcesMock ).toHaveBeenCalledTimes( 2 )
      expect( errorSpy ).toHaveBeenCalledTimes( 1 )
    } )

    it( 'logs how many sources were checked when there were some', async () => {
      const logSpy = vi.spyOn( console, 'log' ).mockImplementation( () => undefined )
      sourcesMock.mockResolvedValueOnce( 3 )
      stop = startIntakePoller()

      await vi.advanceTimersByTimeAsync( TICK_MS )

      expect( logSpy ).toHaveBeenCalledWith( 'Checked 3 Gmail source(s)' )
      expect( logSpy ).not.toHaveBeenCalledWith( expect.stringContaining( 'feed(s)' ) )
    } )

    it( 'does not overlap passes while the sources are being checked', async () => {
      let release: () => void = () => undefined
      sourcesMock.mockImplementation( () => new Promise< number >( ( resolve ) => {
        release = () => resolve( 1 )
      } ) )
      stop = startIntakePoller()

      await vi.advanceTimersByTimeAsync( TICK_MS * 3 )

      expect( checkMock ).toHaveBeenCalledTimes( 1 )

      release()
    } )

    it( 'waits for the sources on stop', async () => {
      let release: () => void = () => undefined
      sourcesMock.mockImplementation( () => new Promise< number >( ( resolve ) => {
        release = () => resolve( 0 )
      } ) )
      stop = startIntakePoller()
      await vi.advanceTimersByTimeAsync( TICK_MS )

      let stopped = false
      const stopping = stop().then( () => {
        stopped = true
      } )
      await vi.advanceTimersByTimeAsync( 10 )

      expect( stopped ).toBe( false )

      release()
      await stopping

      expect( stopped ).toBe( true )
    } )
  } )

  describe( 'the stop function', () => {
    it( 'clears the timer', async () => {
      stop = startIntakePoller()

      await stop()
      await vi.advanceTimersByTimeAsync( TICK_MS * 3 )

      expect( checkMock ).not.toHaveBeenCalled()
    } )

    it( 'waits for a pass that is running', async () => {
      let release: () => void = () => undefined
      checkMock.mockImplementation( () => new Promise< number >( ( resolve ) => {
        release = () => resolve( 0 )
      } ) )
      stop = startIntakePoller()
      await vi.advanceTimersByTimeAsync( TICK_MS )

      let stopped = false
      const stopping = stop().then( () => {
        stopped = true
      } )
      await vi.advanceTimersByTimeAsync( 10 )

      expect( stopped ).toBe( false )

      release()
      await stopping

      expect( stopped ).toBe( true )
    } )

    it( 'can be called when no pass has run', async () => {
      stop = startIntakePoller()

      await expect( stop() ).resolves.toBeUndefined()
    } )
  } )
} )
