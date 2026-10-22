// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { GetStatusResponse, type StatusRow } from '@mnemosyne/shared'
// Errors
import { NotFoundError } from '../errors.js'
// Repositories
import { saveAccount, setAccountStatus } from '../repositories/gmailAccount.repository.js'
import { insertFeed } from '../repositories/feeds.repository.js'
import type { StoredFeed } from '../repositories/feeds.repository.js'
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { runServiceChecks } from './health.service.js'
import { getHealthErrors, getStatus, refreshStatus } from './status.service.js'
// Test support
import { addStoredSource } from '../test-support/gmailSources.fixture.js'

const configMock = vi.hoisted( () => {
  const mock: {
    logLevel: string
    gmail: Record< string, unknown > | null
    agent: { url: string } | null
  } = { logLevel: 'silent', gmail: { clientId: 'id' }, agent: { url: 'http://agent.test' } }

  return mock
} )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( './health.service.js', () => ( { runServiceChecks: vi.fn() } ) )

const at = ( minute: number ): string => {
  return `2026-10-22T10:${ String( minute ).padStart( 2, '0' ) }:00.000Z`
}

const buildFeed = ( overrides: Partial< StoredFeed > = {} ): StoredFeed => {
  const id = overrides.id ?? crypto.randomUUID()

  return {
    id,
    url: 'https://example.com',
    feed_url: `https://example.com/${ id }.xml`,
    name: 'A blog',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    etag: null,
    last_modified: null,
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: at( 0 ),
    deleted_at: null,
    ...overrides,
  }
}

const connectGmail = (): void => {
  saveAccount( {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:x',
    scope: 'scope',
    status: 'connected',
    error: null,
    connected_at: at( 0 ),
  } )
}

const rowOf = ( kind: string, id = 'default' ): StatusRow => {
  const row = getStatus().rows.find( ( found ) => found.kind === kind && found.id === id )

  if( row === undefined ) {
    throw new Error( `No ${ kind } row` )
  }

  return row
}

beforeEach( () => {
  configMock.gmail = { clientId: 'id' }
  configMock.agent = { url: 'http://agent.test' }
  vi.mocked( runServiceChecks ).mockReset().mockResolvedValue( undefined )
} )

describe( 'getStatus', () => {
  it( 'has the singleton rows even when nothing was ever checked', () => {
    const { rows, failing_count } = getStatus()

    expect( rows.map( ( { kind } ) => kind ) )
      .toEqual( [ 'agent', 'whisper', 'backup', 'gmail_connection' ] )
    expect( failing_count ).toBe( 0 )
    expect( GetStatusResponse.parse( getStatus() ) ).toEqual( getStatus() )
  } )

  it( 'names the singletons', () => {
    expect( getStatus().rows.map( ( { name } ) => name ) )
      .toEqual( [ 'Agent service', 'whisper-server', 'Backups', 'Gmail connection' ] )
  } )

  it( 'shows a never-checked service as ok with no times', () => {
    expect( rowOf( 'whisper' ) ).toEqual( {
      kind: 'whisper',
      id: 'default',
      name: 'whisper-server',
      state: 'ok',
      last_checked_at: null,
      last_success_at: null,
      last_error: null,
      failing_since: null,
      detail: null,
    } )
  } )

  it( 'is failing with the error and the times when a check failed', () => {
    recordSuccess( 'whisper', 'default', at( 1 ) )
    recordFailure( 'whisper', 'default', at( 2 ), 'Could not reach whisper-server' )

    expect( rowOf( 'whisper' ) ).toMatchObject( {
      state: 'failing',
      last_checked_at: at( 2 ),
      last_success_at: at( 1 ),
      last_error: 'Could not reach whisper-server',
      failing_since: at( 2 ),
    } )
    expect( getStatus().failing_count ).toBe( 1 )
  } )

  it( 'never marks whisper-server off', () => {
    configMock.agent = null
    setSetting( 'linking_enabled', false )

    expect( rowOf( 'whisper' ).state ).toBe( 'ok' )
  } )

  describe( 'agent', () => {
    it( 'is off when it is not configured', () => {
      configMock.agent = null

      expect( rowOf( 'agent' ).state ).toBe( 'off' )
    } )

    it( 'is off when linking is switched off, hiding an old error', () => {
      recordFailure( 'agent', 'default', at( 1 ), 'down' )
      setSetting( 'linking_enabled', false )

      expect( rowOf( 'agent' ) ).toMatchObject( {
        state: 'off',
        last_error: null,
        failing_since: null,
      } )
      expect( getStatus().failing_count ).toBe( 0 )
    } )

    it( 'is failing when its check failed and linking is on', () => {
      recordFailure( 'agent', 'default', at( 1 ), 'The agent service is not reachable' )

      expect( rowOf( 'agent' ) ).toMatchObject( { state: 'failing' } )
    } )
  } )

  describe( 'gmail connection', () => {
    it( 'is off when Gmail is not configured', () => {
      configMock.gmail = null

      expect( rowOf( 'gmail_connection' ).state ).toBe( 'off' )
    } )

    it( 'is off when no account is connected', () => {
      expect( rowOf( 'gmail_connection' ).state ).toBe( 'off' )
    } )

    it( 'is ok when connected and nothing failed', () => {
      connectGmail()

      expect( rowOf( 'gmail_connection' ) ).toMatchObject( { state: 'ok', last_error: null } )
    } )

    it( 'is failing with the account\'s error when it needs a reconnect', () => {
      connectGmail()
      setAccountStatus( 'reconnect_needed', 'Google no longer accepts the access' )

      expect( rowOf( 'gmail_connection' ) ).toMatchObject( {
        state: 'failing',
        last_error: 'Google no longer accepts the access',
      } )
      expect( getStatus().failing_count ).toBe( 1 )
    } )

    it( 'prefers the health error when there is one', () => {
      connectGmail()
      setAccountStatus( 'reconnect_needed', 'from the account' )
      recordFailure( 'gmail_connection', 'default', at( 3 ), 'from the check' )

      expect( rowOf( 'gmail_connection' ).last_error ).toBe( 'from the check' )
    } )
  } )

  describe( 'backup', () => {
    it( 'is ok with no detail before the first backup', () => {
      expect( rowOf( 'backup' ) )
        .toMatchObject( { state: 'ok', detail: null, last_success_at: null } )
    } )

    it( 'shows the file and size of the last backup', () => {
      recordSuccess(
        'backup',
        'default',
        at( 5 ),
        JSON.stringify( { file: 'mnemosyne-20261022-180500.db', bytes: 1_572_864 } ),
      )

      expect( rowOf( 'backup' ) ).toMatchObject( {
        state: 'ok',
        last_success_at: at( 5 ),
        detail: 'mnemosyne-20261022-180500.db, 1.5 MB',
      } )
    } )

    it( 'formats small sizes in bytes and KB', () => {
      recordSuccess( 'backup', 'default', at( 1 ), JSON.stringify( { file: 'a.db', bytes: 900 } ) )
      expect( rowOf( 'backup' ).detail ).toBe( 'a.db, 900 B' )

      recordSuccess( 'backup', 'default', at( 2 ), JSON.stringify( { file: 'a.db', bytes: 2048 } ) )
      expect( rowOf( 'backup' ).detail ).toBe( 'a.db, 2.0 KB' )
    } )

    it( 'is failing after a failed backup but still shows the last good one', () => {
      recordSuccess( 'backup', 'default', at( 1 ), JSON.stringify( { file: 'a.db', bytes: 900 } ) )
      recordFailure( 'backup', 'default', at( 2 ), 'disk full' )

      expect( rowOf( 'backup' ) ).toMatchObject( {
        state: 'failing',
        last_error: 'disk full',
        detail: 'a.db, 900 B',
      } )
    } )

    it( 'shows a detail that is not JSON as it is', () => {
      recordSuccess( 'backup', 'default', at( 1 ), 'whatever' )

      expect( rowOf( 'backup' ).detail ).toBe( 'whatever' )
    } )
  } )

  describe( 'feeds and Gmail sources', () => {
    it( 'lists feeds with their name, state and times', () => {
      const feed = buildFeed( { name: 'My blog' } )

      insertFeed( feed )
      recordSuccess( 'feed', feed.id, at( 4 ) )

      expect( rowOf( 'feed', feed.id ) ).toEqual( {
        kind: 'feed',
        id: feed.id,
        name: 'My blog',
        state: 'ok',
        last_checked_at: at( 4 ),
        last_success_at: at( 4 ),
        last_error: null,
        failing_since: null,
        detail: null,
      } )
    } )

    it( 'is ok with null times for a feed that was never checked', () => {
      const feed = buildFeed()

      insertFeed( feed )

      expect( rowOf( 'feed', feed.id ) ).toMatchObject( {
        state: 'ok',
        last_checked_at: null,
        last_success_at: null,
      } )
    } )

    it( 'is failing with the error for a feed whose check failed', () => {
      const feed = buildFeed()

      insertFeed( feed )
      recordFailure( 'feed', feed.id, at( 4 ), 'The site answered 500' )

      expect( rowOf( 'feed', feed.id ) ).toMatchObject( {
        state: 'failing',
        last_error: 'The site answered 500',
        last_success_at: null,
      } )
    } )

    it( 'is off for a disabled feed or source, without an old error', () => {
      const feed = buildFeed( { enabled: false } )
      const source = addStoredSource( { enabled: false } )

      insertFeed( feed )
      recordFailure( 'feed', feed.id, at( 1 ), 'x' )
      recordFailure( 'gmail_source', source.id, at( 1 ), 'y' )

      expect( rowOf( 'feed', feed.id ) ).toMatchObject( { state: 'off', last_error: null } )
      expect( rowOf( 'gmail_source', source.id ) )
        .toMatchObject( { state: 'off', last_error: null } )
      expect( getStatus().failing_count ).toBe( 0 )
    } )

    it( 'leaves out deleted feeds and sources', () => {
      insertFeed( buildFeed( { deleted_at: at( 9 ) } ) )

      expect( getStatus().rows.filter( ( { kind } ) => kind === 'feed' ) ).toEqual( [] )
    } )

    it( 'orders services, backup, connection, Gmail sources, then feeds, each by name', () => {
      insertFeed( buildFeed( { name: 'zeta' } ) )
      insertFeed( buildFeed( { name: 'Alpha' } ) )
      addStoredSource( { name: 'Beta alerts' } )
      addStoredSource( { name: 'alpha alerts' } )

      expect( getStatus().rows.map( ( { kind, name } ) => `${ kind }:${ name }` ) ).toEqual( [
        'agent:Agent service',
        'whisper:whisper-server',
        'backup:Backups',
        'gmail_connection:Gmail connection',
        'gmail_source:alpha alerts',
        'gmail_source:Beta alerts',
        'feed:Alpha',
        'feed:zeta',
      ] )
    } )

    it( 'counts every failing row', () => {
      const feed = buildFeed()
      const source = addStoredSource()

      insertFeed( feed )
      recordFailure( 'feed', feed.id, at( 1 ), 'a' )
      recordFailure( 'gmail_source', source.id, at( 1 ), 'b' )
      recordFailure( 'whisper', 'default', at( 1 ), 'c' )

      expect( getStatus().failing_count ).toBe( 3 )
    } )
  } )
} )

describe( 'refreshStatus', () => {
  it( 'runs the service checks once and then returns the status', async () => {
    vi.mocked( runServiceChecks ).mockImplementation( () => {
      recordFailure( 'whisper', 'default', at( 7 ), 'down' )

      return Promise.resolve()
    } )

    const status = await refreshStatus()

    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )
    expect( status.rows.find( ( { kind } ) => kind === 'whisper' )?.state ).toBe( 'failing' )
    expect( status.failing_count ).toBe( 1 )
  } )
} )

describe( 'getHealthErrors', () => {
  it( 'returns the newest errors first for a feed', () => {
    const feed = buildFeed()

    insertFeed( feed )
    recordFailure( 'feed', feed.id, at( 1 ), 'first' )
    recordFailure( 'feed', feed.id, at( 2 ), 'second' )

    expect( getHealthErrors( 'feed', feed.id ) ).toEqual( [
      { at: at( 2 ), message: 'second' },
      { at: at( 1 ), message: 'first' },
    ] )
  } )

  it( 'returns an empty list for a live subject with no errors', () => {
    const source = addStoredSource()

    expect( getHealthErrors( 'gmail_source', source.id ) ).toEqual( [] )
    expect( getHealthErrors( 'whisper', 'default' ) ).toEqual( [] )
  } )

  it( 'refuses a feed or source that is unknown or deleted', () => {
    const feed = buildFeed( { deleted_at: at( 9 ) } )

    insertFeed( feed )

    expect( () => getHealthErrors( 'feed', feed.id ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( 'feed', 'nope' ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( 'gmail_source', 'nope' ) ).toThrow( NotFoundError )
  } )

  it( 'refuses a singleton with any id but default', () => {
    expect( () => getHealthErrors( 'agent', 'other' ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( 'backup', 'x' ) ).toThrow( NotFoundError )
  } )
} )
