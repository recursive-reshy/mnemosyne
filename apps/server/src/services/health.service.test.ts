// Packages
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
} from 'vitest'
// Logging
import { logger } from '../logger.js'
// Repositories
import { getHealth, listErrors } from '../repositories/health.repository.js'
// Services
import { recordCheck } from './health.service.js'

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'recordCheck', () => {
  it( 'records a success at the time it is given', () => {
    recordCheck( { kind: 'feed', id: 'f1' }, { ok: true }, '2026-10-22T10:00:00.000Z' )

    expect( getHealth( 'feed', 'f1' ) ).toMatchObject( {
      last_checked_at: '2026-10-22T10:00:00.000Z',
      last_success_at: '2026-10-22T10:00:00.000Z',
      last_error: null,
    } )
  } )

  it( 'stamps the current time when none is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime( new Date( '2026-10-22T11:30:00.000Z' ) )

    recordCheck( { kind: 'agent', id: 'default' }, { ok: true } )

    expect( getHealth( 'agent', 'default' )?.last_checked_at ).toBe( '2026-10-22T11:30:00.000Z' )
  } )

  it( 'passes the detail of a success on', () => {
    recordCheck(
      { kind: 'backup', id: 'default' },
      { ok: true, detail: '{"file":"a.db","bytes":10}' },
    )

    expect( getHealth( 'backup', 'default' )?.detail ).toBe( '{"file":"a.db","bytes":10}' )
  } )

  it( 'records a failure with its message and history', () => {
    recordCheck( { kind: 'feed', id: 'f1' }, { ok: false, message: 'HTTP 500' } )

    expect( getHealth( 'feed', 'f1' )?.last_error ).toBe( 'HTTP 500' )
    expect( listErrors( 'feed', 'f1' ).map( ( { message } ) => message ) ).toEqual( [ 'HTTP 500' ] )
  } )

  it( 'logs a failure at warn with the subject, and a success not at all', () => {
    const warn = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )

    recordCheck( { kind: 'feed', id: 'f1' }, { ok: true } )
    expect( warn ).not.toHaveBeenCalled()

    recordCheck( { kind: 'whisper', id: 'default' }, { ok: false, message: 'refused' } )

    expect( warn ).toHaveBeenCalledWith(
      { kind: 'whisper', subject_id: 'default' },
      'Health check failed',
    )
  } )
} )
