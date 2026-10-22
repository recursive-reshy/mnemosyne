// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Gmail
import { GmailAuthError } from '../gmail/auth.js'
import { getMessage, listLabels, listMatchingIds } from '../gmail/gmail.client.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { setAccountStatus } from '../repositories/gmailAccount.repository.js'
import {
  findMessagesByIds,
  insertMessageIfNew,
  listNewsletterInbox,
} from '../repositories/gmailMessages.repository.js'
import { findSourceById } from '../repositories/gmailSources.repository.js'
import { getHealth, listErrors } from '../repositories/health.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
import { listJobs } from './jobs.service.js'
// Test support
import { buildMessage } from '../test-support/gmailMessage.fixture.js'
import type { MessageOptions } from '../test-support/gmailMessage.fixture.js'
import {
  DAY_MS,
  addStoredSource,
  connectGmail,
  idsOf,
} from '../test-support/gmailSources.fixture.js'
// Services
import {
  checkAllSources,
  checkDueSources,
  checkSource,
  stampNewestFirst,
} from './gmailSources.service.js'
import { parseMessage } from '../gmail/parseMessage.js'
// Logging
import { logger } from '../logger.js'
import { getLogContext } from '../logContext.js'

vi.mock( '../gmail/gmail.client.js' )

const configMock = vi.hoisted( () => {
  const mock: { gmail: Record< string, unknown > | null } = { gmail: { clientId: 'id' } }

  return mock
} )

vi.mock( '../config.js', async ( importOriginal ) => {
  const { config } = await importOriginal< typeof import( '../config.js' ) >()

  return { config: Object.assign( configMock, config, { gmail: configMock.gmail } ) }
} )

const NOW = new Date( '2026-10-20T12:00:00.000Z' )
const SYNC_FROM = '2026-10-17T12:00:00.000Z'

const minutesAgo = ( minutes: number ): string => {
  return new Date( NOW.getTime() - minutes * 60_000 ).toISOString()
}

let messages: Record< string, MessageOptions >

const serve = ( found: Record< string, MessageOptions > ): void => {
  messages = found
}

// m0 is the newest, each next one an hour older.
const serveMany = ( count: number ): string[] => {
  const ids = Array.from( { length: count }, ( _, index ) => `m${ index }` )

  serve( Object.fromEntries( ids.map( ( id, index ) => {
    return [ id, { receivedAt: minutesAgo( 60 * ( index + 1 ) ) } ]
  } ) ) )
  vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( ...ids ) )

  return ids
}

const rowsOf = ( sourceId: string ): { message_id: string, status: string }[] => {
  return getDatabase()
    .prepare( `SELECT message_id, status FROM gmail_messages WHERE source_id = ?
      ORDER BY added_at DESC` )
    .all( sourceId ) as { message_id: string, status: string }[]
}

const storeAlready = ( sourceId: string, gmailId: string ): void => {
  const parsed = parseMessage( buildMessage( gmailId, messages[ gmailId ] ?? {} ) )

  stampNewestFirst( [ { parsed, status: 'inbox', backfilled: false } ], NOW, sourceId )
    .forEach( insertMessageIfNew )
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( NOW )
  vi.resetAllMocks()
  connectGmail()
  serve( {} )
  vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
  vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )
  vi.mocked( listLabels ).mockResolvedValue( [] )
  vi.mocked( listMatchingIds ).mockResolvedValue( idsOf() )
  vi.mocked( getMessage ).mockImplementation( ( id, format = 'full' ) => {
    const options = messages[ id ]

    return options === undefined
      ? Promise.reject( new Error( `unexpected message ${ id }` ) )
      : Promise.resolve( buildMessage( id, options, format ) )
  } )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'checkSource: reading the mailbox', () => {
  it( 'lists from two days before sync_from, at most 100', async () => {
    const source = addStoredSource( { sync_from: SYNC_FROM } )

    await checkSource( source.id )

    expect( listMatchingIds ).toHaveBeenCalledWith(
      source.match,
      { after: new Date( Date.parse( SYNC_FROM ) - 2 * DAY_MS ), max: 100 },
    )
  } )

  it( 'fetches and stores each new email in full', async () => {
    const source = addStoredSource()

    serve( { m1: { subject: 'One', html: '<p>one</p>', text: 'one' } } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )

    await checkSource( source.id )

    expect( getMessage ).toHaveBeenCalledWith( 'm1', 'full' )

    const [ stored ] = findMessagesByIds( rowIdsOf( source.id ) )

    expect( stored ).toMatchObject( {
      message_id: 'm1',
      subject: 'One',
      sender: 'Ada',
      sender_address: 'ada@example.com',
      body_html: '<p>one</p>',
      body_text: 'one',
      backfilled: false,
      attempts: 0,
    } )
  } )

  it( 'does not fetch an email the source already has', async () => {
    const source = addStoredSource()

    serve( { m1: {}, m2: {} } )
    storeAlready( source.id, 'm1' )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1', 'm2' ) )

    await checkSource( source.id )

    expect( getMessage ).toHaveBeenCalledTimes( 1 )
    expect( getMessage ).toHaveBeenCalledWith( 'm2', 'full' )
    expect( rowsOf( source.id ) ).toHaveLength( 2 )
  } )

  it( 'stores an email once however often a check sees it', async () => {
    const source = addStoredSource()

    serve( { m1: {} } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1', 'm1' ) )

    await checkSource( source.id )
    await checkSource( source.id )

    expect( rowsOf( source.id ) ).toHaveLength( 1 )
    expect( getMessage ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'lets two sources each keep the same email', async () => {
    const first = addStoredSource( { name: 'A' } )
    const second = addStoredSource( { name: 'B' } )

    serve( { m1: {} } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )

    await checkSource( first.id )
    await checkSource( second.id )

    expect( rowsOf( first.id ) ).toHaveLength( 1 )
    expect( rowsOf( second.id ) ).toHaveLength( 1 )
  } )

  it( 'records the check and clears an earlier error', async () => {
    const source = addStoredSource( { last_error: 'Old problem' } )

    const checked = await checkSource( source.id )

    expect( checked ).toMatchObject( {
      id: source.id,
      last_checked_at: NOW.toISOString(),
      last_error: null,
    } )
  } )

  it( 'leaves sync_from where it was', async () => {
    const source = addStoredSource( { sync_from: SYNC_FROM } )

    serve( { m1: {} } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )
    await checkSource( source.id )

    expect( findSourceById( source.id )?.sync_from ).toBe( SYNC_FROM )
  } )
} )

const rowIdsOf = ( sourceId: string ): string[] => {
  const rows = getDatabase()
    .prepare( 'SELECT id FROM gmail_messages WHERE source_id = ? ORDER BY added_at DESC' )
    .all( sourceId ) as { id: string }[]

  return rows.map( ( { id } ) => id )
}

describe( 'checkSource: newsletters', () => {
  it( 'puts new emails in the inbox, newest first', async () => {
    const source = addStoredSource( { destination: 'newsletter' } )

    serveMany( 3 )

    const checked = await checkSource( source.id )

    expect( rowsOf( source.id ) ).toEqual( [
      { message_id: 'm0', status: 'inbox' },
      { message_id: 'm1', status: 'inbox' },
      { message_id: 'm2', status: 'inbox' },
    ] )
    expect( listNewsletterInbox().map( ( row ) => row.message_id ) ).toEqual( [ 'm0', 'm1', 'm2' ] )
    expect( checked ).toMatchObject( { inbox_count: 3, last_skipped_count: 0 } )
  } )

  it( 'takes the 10 newest into the inbox and skips the rest, bodies dropped', async () => {
    const source = addStoredSource( { destination: 'newsletter' } )

    serveMany( 12 )

    const checked = await checkSource( source.id )
    const rows = rowsOf( source.id )

    expect( rows.filter( ( { status } ) => status === 'inbox' ).map( ( row ) => row.message_id ) )
      .toEqual( Array.from( { length: 10 }, ( _, index ) => `m${ index }` ) )
    expect( rows.filter( ( { status } ) => status === 'skipped' ).map( ( row ) => row.message_id ) )
      .toEqual( [ 'm10', 'm11' ] )
    expect( checked ).toMatchObject( { inbox_count: 10, last_skipped_count: 2 } )

    const skipped = findMessagesByIds( rowIdsOf( source.id ) )
      .filter( ( { status } ) => status === 'skipped' )

    expect( skipped ).toHaveLength( 2 )
    skipped.forEach( ( row ) => {
      expect( row ).toMatchObject( { body_html: null, body_text: null } )
    } )
  } )

  it( 'counts only the emails of this check as skipped, and resets the count', async () => {
    const source = addStoredSource( { destination: 'newsletter', last_skipped_count: 7 } )

    serveMany( 2 )

    expect( ( await checkSource( source.id ) ).last_skipped_count ).toBe( 0 )
  } )

  it( 'keeps the skipped count when a check finds nothing new', async () => {
    const source = addStoredSource( { destination: 'newsletter', last_skipped_count: 7 } )

    expect( ( await checkSource( source.id ) ).last_skipped_count ).toBe( 7 )
  } )

  it( 'does not count emails it already had toward the 10', async () => {
    const source = addStoredSource( { destination: 'newsletter' } )
    const ids = serveMany( 12 )

    ids.slice( 0, 5 ).forEach( ( id ) => storeAlready( source.id, id ) )

    const checked = await checkSource( source.id )

    expect( checked.last_skipped_count ).toBe( 0 )
    expect( rowsOf( source.id ).filter( ( { status } ) => status === 'inbox' ) ).toHaveLength( 12 )
  } )
} )

describe( 'checkSource: job alerts', () => {
  it( 'stores every new email as pending, with no cap, bodies kept', async () => {
    const source = addStoredSource( { destination: 'jobs', last_skipped_count: 4 } )

    serveMany( 15 )

    const checked = await checkSource( source.id )

    const pending = rowsOf( source.id ).filter( ( { status } ) => status === 'pending' )

    expect( pending ).toHaveLength( 15 )
    expect( checked ).toMatchObject( { inbox_count: 0, last_skipped_count: 4 } )

    const [ row ] = findMessagesByIds( rowIdsOf( source.id ) )

    expect( row?.body_html ).not.toBeNull()
  } )
} )

describe( 'checkSource: not checking', () => {
  it( 'refuses a turned-off source without calling Gmail', async () => {
    const source = addStoredSource( { enabled: false } )

    await expect( checkSource( source.id ) ).rejects.toBeInstanceOf( ConflictError )
    expect( listMatchingIds ).not.toHaveBeenCalled()
  } )

  it( 'does not find a deleted or unknown source', async () => {
    const gone = addStoredSource( { deleted_at: minutesAgo( 5 ) } )

    await expect( checkSource( gone.id ) ).rejects.toBeInstanceOf( NotFoundError )
    await expect( checkSource( crypto.randomUUID() ) ).rejects.toBeInstanceOf( NotFoundError )
  } )

  it.each( [ 'not connected', 'reconnect needed' ] )( 'refuses while %s', async ( state ) => {
    const source = addStoredSource()

    if( state === 'not connected' ) {
      getDatabase().prepare( 'DELETE FROM gmail_account' ).run()
    } else {
      setAccountStatus( 'reconnect_needed', 'revoked' )
    }

    await expect( checkSource( source.id ) ).rejects.toBeInstanceOf( ConflictError )
    expect( listMatchingIds ).not.toHaveBeenCalled()
    expect( findSourceById( source.id )?.last_error ).toBeNull()
  } )
} )

describe( 'checkSource: when something goes wrong', () => {
  it( 'records a failed listing and keeps going on the next check', async () => {
    const source = addStoredSource()

    vi.mocked( listMatchingIds ).mockRejectedValue( new Error( 'Gmail is down' ) )

    expect( await checkSource( source.id ) ).toMatchObject( {
      last_error: 'Gmail is down',
      last_checked_at: NOW.toISOString(),
    } )
  } )

  it( 'keeps the emails read before a fetch failed, and records the failure', async () => {
    const source = addStoredSource()

    serve( { m1: {}, m3: {} } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1', 'm2', 'm3' ) )
    // m2 is not served, so fetching it fails.

    const checked = await checkSource( source.id )

    expect( rowsOf( source.id ).map( ( row ) => row.message_id ) ).toEqual( [ 'm1' ] )
    expect( checked.last_error ).toBe( 'unexpected message m2' )
    expect( getMessage ).not.toHaveBeenCalledWith( 'm3', 'full' )
  } )

  it( 'picks up the rest on the next check', async () => {
    const source = addStoredSource()

    serve( { m1: {}, m3: {} } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1', 'm2', 'm3' ) )
    await checkSource( source.id )

    serve( { m2: {}, m3: {} } )
    await checkSource( source.id )

    const stored = rowsOf( source.id ).map( ( row ) => row.message_id ).sort()

    expect( stored ).toEqual( [ 'm1', 'm2', 'm3' ] )
    expect( findSourceById( source.id )?.last_error ).toBeNull()
  } )

  it( 'turns an auth failure into a conflict, recording and storing nothing', async () => {
    const source = addStoredSource()

    serve( { m1: {} } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1', 'm2' ) )
    vi.mocked( getMessage )
      .mockResolvedValueOnce( buildMessage( 'm1' ) )
      .mockRejectedValueOnce( new GmailAuthError( 'Google no longer accepts access' ) )

    await expect( checkSource( source.id ) )
      .rejects.toThrow( new ConflictError( 'Google no longer accepts access' ) )
    expect( rowsOf( source.id ) ).toEqual( [] )
    expect( findSourceById( source.id )?.last_checked_at ).toBeNull()
  } )

  it( 'names a label Gmail no longer has, and still reads the others', async () => {
    const source = addStoredSource( {
      match: { kind: 'labels', label_ids: [ 'Label_1', 'Label_9' ] },
    } )

    serve( { m1: {} } )
    vi.mocked( listMatchingIds ).mockResolvedValue( {
      ...idsOf( 'm1' ),
      missingLabelIds: [ 'Label_9' ],
    } )

    const checked = await checkSource( source.id )

    expect( checked.last_error ).toBe( 'Label not found in Gmail: Label_9' )
    expect( rowsOf( source.id ) ).toHaveLength( 1 )
  } )

  it( 'records a missing label as a failure, then a clean check as a success', async () => {
    const source = addStoredSource( { match: { kind: 'labels', label_ids: [ 'Label_9' ] } } )

    vi.mocked( listMatchingIds ).mockResolvedValue( { ...idsOf(), missingLabelIds: [ 'Label_9' ] } )
    await checkSource( source.id )

    expect( getHealth( 'gmail_source', source.id ) ).toMatchObject( {
      last_checked_at: NOW.toISOString(),
      last_success_at: null,
      last_error: 'Label not found in Gmail: Label_9',
      failing_since: NOW.toISOString(),
    } )
    expect( listErrors( 'gmail_source', source.id ) )
      .toEqual( [ { at: NOW.toISOString(), message: 'Label not found in Gmail: Label_9' } ] )

    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf() )
    await checkSource( source.id )

    expect( getHealth( 'gmail_source', source.id ) ).toMatchObject( {
      last_success_at: NOW.toISOString(),
      last_error: null,
      failing_since: null,
    } )
  } )

  it( 'lists every missing label', async () => {
    const source = addStoredSource( { match: { kind: 'labels', label_ids: [ 'A', 'B' ] } } )

    vi.mocked( listMatchingIds ).mockResolvedValue( { ...idsOf(), missingLabelIds: [ 'A', 'B' ] } )

    expect( ( await checkSource( source.id ) ).last_error ).toBe( 'Label not found in Gmail: A, B' )
  } )
} )

describe( 'checkAllSources', () => {
  it( 'checks the turned-on sources in order and returns the list', async () => {
    const first = addStoredSource( { name: 'A' } )
    const off = addStoredSource( { name: 'B', enabled: false } )
    const third = addStoredSource( { name: 'C' } )

    const sources = await checkAllSources()

    expect( sources.map( ( { id } ) => id ) ).toEqual( [ first.id, off.id, third.id ] )
    expect( findSourceById( first.id )?.last_checked_at ).toBe( NOW.toISOString() )
    expect( findSourceById( third.id )?.last_checked_at ).toBe( NOW.toISOString() )
    expect( findSourceById( off.id )?.last_checked_at ).toBeNull()
    expect( listMatchingIds ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'needs Gmail to be connected', async () => {
    addStoredSource()
    setAccountStatus( 'reconnect_needed', 'revoked' )

    await expect( checkAllSources() ).rejects.toBeInstanceOf( ConflictError )
    expect( listMatchingIds ).not.toHaveBeenCalled()
  } )

  it( 'stops at an auth failure and leaves the later sources alone', async () => {
    const first = addStoredSource( { name: 'A' } )
    const second = addStoredSource( { name: 'B' } )

    vi.mocked( listMatchingIds ).mockRejectedValue( new GmailAuthError( 'revoked' ) )

    await expect( checkAllSources() ).rejects.toBeInstanceOf( ConflictError )
    expect( listMatchingIds ).toHaveBeenCalledTimes( 1 )
    expect( findSourceById( first.id )?.last_checked_at ).toBeNull()
    expect( findSourceById( second.id )?.last_checked_at ).toBeNull()
  } )
} )

describe( 'checkDueSources', () => {
  beforeEach( () => {
    setSetting( 'feed_check_interval_minutes', 15 )
  } )

  it( 'checks each due source inside a log context carrying its id', async () => {
    const one = addStoredSource( { name: 'One' } )
    const two = addStoredSource( { name: 'Two' } )
    const seen: ( string | undefined )[] = []
    vi.mocked( listMatchingIds ).mockImplementation( () => {
      seen.push( getLogContext()?.gmail_source_id )

      return Promise.resolve( idsOf() )
    } )

    await checkDueSources()

    expect( seen.sort() ).toEqual( [ one.id, two.id ].sort() )
    expect( getLogContext() ).toBeUndefined()
  } )

  it( 'checks the sources not checked within the interval, and counts them', async () => {
    const never = addStoredSource( { name: 'Never' } )
    const stale = addStoredSource( { name: 'Stale', last_checked_at: minutesAgo( 20 ) } )
    const fresh = addStoredSource( { name: 'Fresh', last_checked_at: minutesAgo( 5 ) } )
    const off = addStoredSource( { name: 'Off', enabled: false } )

    expect( await checkDueSources() ).toBe( 2 )
    expect( findSourceById( never.id )?.last_checked_at ).toBe( NOW.toISOString() )
    expect( findSourceById( stale.id )?.last_checked_at ).toBe( NOW.toISOString() )
    expect( findSourceById( fresh.id )?.last_checked_at ).toBe( minutesAgo( 5 ) )
    expect( findSourceById( off.id )?.last_checked_at ).toBeNull()
  } )

  it( 'follows the interval in settings', async () => {
    const source = addStoredSource( { last_checked_at: minutesAgo( 20 ) } )

    setSetting( 'feed_check_interval_minutes', 60 )

    expect( await checkDueSources() ).toBe( 0 )
    expect( findSourceById( source.id )?.last_checked_at ).toBe( minutesAgo( 20 ) )
  } )

  it( 'counts a source whose check failed, which records its error', async () => {
    const source = addStoredSource()

    vi.mocked( listMatchingIds ).mockRejectedValue( new Error( 'Gmail is down' ) )

    expect( await checkDueSources() ).toBe( 1 )
    expect( findSourceById( source.id )?.last_error ).toBe( 'Gmail is down' )
  } )

  it.each( [ 'not configured', 'not connected', 'reconnect needed' ] )(
    'does nothing while Gmail is %s',
    async ( state ) => {
      addStoredSource()

      if( state === 'not configured' ) {
        configMock.gmail = null
      } else if( state === 'not connected' ) {
        getDatabase().prepare( 'DELETE FROM gmail_account' ).run()
      } else {
        setAccountStatus( 'reconnect_needed', 'revoked' )
      }

      expect( await checkDueSources() ).toBe( 0 )
      expect( listMatchingIds ).not.toHaveBeenCalled()

      configMock.gmail = { clientId: 'id' }
    },
  )

  it( 'stops at an auth failure and leaves the later sources alone', async () => {
    const first = addStoredSource( { name: 'A' } )
    const second = addStoredSource( { name: 'B' } )

    vi.mocked( listMatchingIds ).mockRejectedValue( new GmailAuthError( 'revoked' ) )

    expect( await checkDueSources() ).toBe( 0 )
    expect( listMatchingIds ).toHaveBeenCalledTimes( 1 )
    expect( findSourceById( first.id )?.last_checked_at ).toBeNull()
    expect( findSourceById( second.id )?.last_checked_at ).toBeNull()
  } )
} )

describe( 'checkSource: automatic summaries', () => {
  const readable = `<p>${ 'Words worth reading, one after another. '.repeat( 12 ) }</p>`

  const serveReadable = ( ids: string[] ): void => {
    serve( Object.fromEntries( ids.map( ( id, index ) => {
      return [ id, { html: readable, receivedAt: minutesAgo( 60 * ( index + 1 ) ) } ]
    } ) ) )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( ...ids ) )
  }

  const statuses = ( sourceId: string ): string[] => rowsOf( sourceId ).map( ( row ) => row.status )

  it( 'queues the new emails of an automatic newsletter source', async () => {
    const source = addStoredSource( { destination: 'newsletter', auto_summarize: true } )

    serveReadable( [ 'm1', 'm2' ] )

    const checked = await checkSource( source.id )

    expect( statuses( source.id ) ).toEqual( [ 'queued', 'queued' ] )
    expect( checked.inbox_count ).toBe( 0 )
    expect( listJobs() ).toHaveLength( 2 )
    expect( listJobs()[ 0 ] ).toMatchObject( {
      gmail_source_id: source.id,
      gmail_source_name: source.name,
      status: 'summarizing',
    } )
  } )

  it( 'leaves the emails of a source that is not automatic in the inbox', async () => {
    const source = addStoredSource( { destination: 'newsletter', auto_summarize: false } )

    serveReadable( [ 'm1' ] )
    await checkSource( source.id )

    expect( statuses( source.id ) ).toEqual( [ 'inbox' ] )
    expect( listJobs() ).toEqual( [] )
  } )

  it( 'queues nothing for a jobs source', async () => {
    const source = addStoredSource( { destination: 'jobs', auto_summarize: true } )

    serveReadable( [ 'm1' ] )
    await checkSource( source.id )

    expect( statuses( source.id ) ).toEqual( [ 'pending' ] )
    expect( listJobs() ).toEqual( [] )
  } )

  it( 'queues the ten that reached the inbox, not the ones it skipped', async () => {
    const source = addStoredSource( { destination: 'newsletter', auto_summarize: true } )

    serveReadable( Array.from( { length: 12 }, ( _, index ) => `m${ index }` ) )
    await checkSource( source.id )

    expect( statuses( source.id ).filter( ( status ) => status === 'queued' ) ).toHaveLength( 10 )
    expect( statuses( source.id ).filter( ( status ) => status === 'skipped' ) ).toHaveLength( 2 )
    expect( listJobs() ).toHaveLength( 10 )
  } )

  it( 'leaves an email it cannot queue in the inbox, logs it, and queues the others', async () => {
    const source = addStoredSource( { destination: 'newsletter', auto_summarize: true } )

    serve( {
      m1: { html: readable, receivedAt: minutesAgo( 60 ) },
      m2: { html: '<p>Hi.</p>', text: 'Hi.', receivedAt: minutesAgo( 120 ) },
    } )
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1', 'm2' ) )

    const checked = await checkSource( source.id )

    expect( statuses( source.id ).sort() ).toEqual( [ 'inbox', 'queued' ] )
    expect( checked.last_error ).toBeNull()
    expect( logger.error ).toHaveBeenCalledWith(
      expect.objectContaining( { subject: 'Subject of m2' } ),
      expect.any( String ),
    )
  } )

  it( 'does not queue an email again on the next check', async () => {
    const source = addStoredSource( { destination: 'newsletter', auto_summarize: true } )

    serveReadable( [ 'm1' ] )
    await checkSource( source.id )
    await checkSource( source.id )

    expect( listJobs() ).toHaveLength( 1 )
  } )

  it( 'queues the emails of every automatic source in a due pass', async () => {
    const source = addStoredSource( { destination: 'newsletter', auto_summarize: true } )

    setSetting( 'feed_check_interval_minutes', 15 )
    serveReadable( [ 'm1' ] )

    expect( await checkDueSources() ).toBe( 1 )
    expect( statuses( source.id ) ).toEqual( [ 'queued' ] )
  } )
} )
