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
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( {
  logLevel: 'silent',
  sessionDays: 30,
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
    recordCheck( userId, { kind: 'feed', id: 'f1' }, { ok: true }, '2026-10-22T10:00:00.000Z' )

    expect( getHealth( userId, 'feed', 'f1' ) ).toMatchObject( {
      last_checked_at: '2026-10-22T10:00:00.000Z',
      last_success_at: '2026-10-22T10:00:00.000Z',
      last_error: null,
    } )
  } )

  it( 'stamps the current time when none is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime( new Date( '2026-10-22T11:30:00.000Z' ) )

    recordCheck( null, { kind: 'agent', id: 'default' }, { ok: true } )

    expect( getHealth( null, 'agent', 'default' )?.last_checked_at )
      .toBe( '2026-10-22T11:30:00.000Z' )
  } )

  it( 'passes the detail of a success on', () => {
    recordCheck(
      null,
      { kind: 'backup', id: 'default' },
      { ok: true, detail: '{"file":"a.db","bytes":10}' },
    )

    expect( getHealth( null, 'backup', 'default' )?.detail ).toBe( '{"file":"a.db","bytes":10}' )
  } )

  it( 'records a failure with its message and history', () => {
    recordCheck( userId, { kind: 'feed', id: 'f1' }, { ok: false, message: 'HTTP 500' } )

    expect( getHealth( userId, 'feed', 'f1' )?.last_error ).toBe( 'HTTP 500' )
    expect( listErrors( userId, 'feed', 'f1' ).map( ( { message } ) => message ) )
      .toEqual( [ 'HTTP 500' ] )
  } )

  it( 'logs a failure at warn with the subject, and a success not at all', () => {
    const warn = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )

    recordCheck( userId, { kind: 'feed', id: 'f1' }, { ok: true } )
    expect( warn ).not.toHaveBeenCalled()

    recordCheck( null, { kind: 'whisper', id: 'default' }, { ok: false, message: 'refused' } )

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
    expect( getHealth( null, 'agent', 'default' ) ).toMatchObject( { last_error: null } )
    expect( getHealth( null, 'agent', 'default' )?.last_success_at ).not.toBeNull()
    expect( getHealth( null, 'whisper', 'default' ) ).toMatchObject( { last_error: null } )
    expect( getHealth( null, 'whisper', 'default' )?.last_success_at ).not.toBeNull()
  } )

  it( 'records an unavailable agent as failing', async () => {
    vi.mocked( checkHealth ).mockResolvedValue( 'unavailable' )

    await runServiceChecks()

    expect( getHealth( null, 'agent', 'default' )?.last_error )
      .toBe( 'The agent service is not reachable' )
    expect( getHealth( null, 'whisper', 'default' )?.last_error ).toBeNull()
  } )

  it( 'records whisper-server\'s message when it is down', async () => {
    vi.mocked( checkWhisperHealth ).mockRejectedValue(
      new Error( 'Could not reach whisper-server at http://whisper.test:8178: fetch failed' ),
    )

    await runServiceChecks()

    expect( getHealth( null, 'whisper', 'default' )?.last_error )
      .toBe( 'Could not reach whisper-server at http://whisper.test:8178: fetch failed' )
    expect( getHealth( null, 'agent', 'default' )?.last_error ).toBeNull()
  } )

  it( 'skips the agent when it is not configured', async () => {
    configMock.agent = null

    await runServiceChecks()

    expect( checkHealth ).not.toHaveBeenCalled()
    expect( getHealth( null, 'agent', 'default' ) ).toBeUndefined()
    expect( getHealth( null, 'whisper', 'default' ) ).toBeDefined()
  } )

  it( 'still checks the agent when a user switched linking off', async () => {
    setSetting( userId, 'linking_enabled', false )

    await runServiceChecks()

    expect( checkHealth ).toHaveBeenCalled()
    expect( getHealth( null, 'agent', 'default' ) ).toMatchObject( { last_error: null } )
  } )

  it( 'still checks whisper-server when the agent check throws', async () => {
    vi.mocked( checkHealth ).mockRejectedValue( new Error( 'boom' ) )

    await runServiceChecks()

    expect( getHealth( null, 'agent', 'default' )?.last_error ).toBe( 'boom' )
    expect( getHealth( null, 'whisper', 'default' ) ).toBeDefined()
  } )
} )
