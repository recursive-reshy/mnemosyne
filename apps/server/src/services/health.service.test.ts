// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Clients
import { checkHealth } from '../clients/agent.client.js'
import { checkWhisperHealth } from '../clients/whisperServer.client.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { getHealth, listErrors } from '../repositories/health.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { recordCheck, runServiceChecks } from './health.service.js'

const configMock = vi.hoisted( () => ( {
  logLevel: 'silent',
  whisperUrl: 'http://whisper.test:8178',
  agent: null as { url: string } | null,
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/agent.client.js', () => ( { checkHealth: vi.fn() } ) )
vi.mock( '../clients/whisperServer.client.js', () => ( { checkWhisperHealth: vi.fn() } ) )

beforeEach( () => {
  configMock.agent = { url: 'http://agent.test:8100' }
  vi.mocked( checkHealth ).mockReset().mockResolvedValue( 'ok' )
  vi.mocked( checkWhisperHealth ).mockReset().mockResolvedValue( undefined )
} )

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

describe( 'runServiceChecks', () => {
  it( 'records the agent and whisper-server as ok, asking the agent afresh', async () => {
    await runServiceChecks()

    expect( checkHealth ).toHaveBeenCalledWith( { fresh: true } )
    expect( checkWhisperHealth ).toHaveBeenCalledWith( 'http://whisper.test:8178' )
    expect( getHealth( 'agent', 'default' ) ).toMatchObject( { last_error: null } )
    expect( getHealth( 'agent', 'default' )?.last_success_at ).not.toBeNull()
    expect( getHealth( 'whisper', 'default' ) ).toMatchObject( { last_error: null } )
    expect( getHealth( 'whisper', 'default' )?.last_success_at ).not.toBeNull()
  } )

  it( 'records an unavailable agent as failing', async () => {
    vi.mocked( checkHealth ).mockResolvedValue( 'unavailable' )

    await runServiceChecks()

    expect( getHealth( 'agent', 'default' )?.last_error )
      .toBe( 'The agent service is not reachable' )
    expect( getHealth( 'whisper', 'default' )?.last_error ).toBeNull()
  } )

  it( 'records whisper-server\'s message when it is down', async () => {
    vi.mocked( checkWhisperHealth ).mockRejectedValue(
      new Error( 'Could not reach whisper-server at http://whisper.test:8178: fetch failed' ),
    )

    await runServiceChecks()

    expect( getHealth( 'whisper', 'default' )?.last_error )
      .toBe( 'Could not reach whisper-server at http://whisper.test:8178: fetch failed' )
    expect( getHealth( 'agent', 'default' )?.last_error ).toBeNull()
  } )

  it( 'skips the agent when it is not configured', async () => {
    configMock.agent = null

    await runServiceChecks()

    expect( checkHealth ).not.toHaveBeenCalled()
    expect( getHealth( 'agent', 'default' ) ).toBeUndefined()
    expect( getHealth( 'whisper', 'default' ) ).toBeDefined()
  } )

  it( 'skips the agent when linking is switched off', async () => {
    setSetting( 'linking_enabled', false )

    await runServiceChecks()

    expect( checkHealth ).not.toHaveBeenCalled()
    expect( getHealth( 'agent', 'default' ) ).toBeUndefined()
  } )

  it( 'still checks whisper-server when the agent check throws', async () => {
    vi.mocked( checkHealth ).mockRejectedValue( new Error( 'boom' ) )

    await runServiceChecks()

    expect( getHealth( 'agent', 'default' )?.last_error ).toBe( 'boom' )
    expect( getHealth( 'whisper', 'default' ) ).toBeDefined()
  } )
} )
