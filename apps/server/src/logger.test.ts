// Packages
import { describe, it, expect } from 'vitest'
// Logging
import { createLogger } from './logger.js'
import { withLogContext } from './logContext.js'

type Line = Record< string, unknown >

const capture = (): { lines: () => Line[], write: ( chunk: string ) => void } => {
  const chunks: string[] = []

  return {
    write: ( chunk ) => void chunks.push( chunk ),
    lines: () => chunks.map( ( chunk ) => JSON.parse( chunk ) as Line ),
  }
}

const loggerWith = ( level = 'info' ): ReturnType< typeof capture > & {
  logger: ReturnType< typeof createLogger >
} => {
  const sink = capture()

  return { ...sink, logger: createLogger( sink, level ) }
}

describe( 'logger', () => {
  it( 'writes JSON with a label level, an ISO time and the service', () => {
    const { logger, lines } = loggerWith()

    logger.info( { checked: 2 }, 'Checked feeds' )

    const [ line ] = lines()

    expect( line ).toMatchObject( {
      level: 'info',
      service: 'server',
      msg: 'Checked feeds',
      checked: 2,
    } )
    expect( new Date( line?.time as string ).toISOString() ).toBe( line?.time )
  } )

  it( 'honours the level', () => {
    const { logger, lines } = loggerWith( 'warn' )

    logger.info( 'quiet' )
    logger.warn( 'loud' )

    expect( lines().map( ( line ) => line.msg ) ).toEqual( [ 'loud' ] )
  } )

  it( 'serializes an error given as err with its message and stack', () => {
    const { logger, lines } = loggerWith()

    logger.error( { err: new Error( 'boom' ) }, 'Failed' )

    expect( lines()[ 0 ]?.err ).toMatchObject( {
      message: 'boom',
      stack: expect.any( String ) as string,
    } )
  } )

  it.each( [
    'authorization', 'token', 'refresh_token', 'access_token', 'apiKey', 'api_key', 'secret',
  ] )(
    'censors a nested %s',
    ( key ) => {
      const { logger, lines } = loggerWith()

      logger.info( { request: { [ key ]: 'sentinel', other: 'kept' } }, 'Sent' )

      expect( lines()[ 0 ]?.request ).toEqual( { [ key ]: '[redacted]', other: 'kept' } )
    },
  )

  it( 'adds the log context inside withLogContext and nothing outside it', () => {
    const { logger, lines } = loggerWith()

    withLogContext( { job_id: 'j1' }, () => logger.info( 'inside' ) )
    logger.info( 'outside' )

    const [ inside, outside ] = lines()

    expect( inside?.job_id ).toBe( 'j1' )
    expect( outside ).not.toHaveProperty( 'job_id' )
  } )
} )
