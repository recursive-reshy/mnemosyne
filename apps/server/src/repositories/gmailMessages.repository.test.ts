// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Repositories
import {
  countInbox,
  dismissInboxForSource,
  findMessagesByIds,
  findStoredMessageIds,
  insertMessageIfNew,
  listAlertEmails,
  listNewsletterInbox,
  listPendingAlerts,
  recordAttempt,
  setMessageStatus,
} from './gmailMessages.repository.js'
import type { StoredGmailMessage } from './gmailMessages.repository.js'
import { insertSource } from './gmailSources.repository.js'
import type { StoredGmailSource } from './gmailSources.repository.js'
import { upsertPosting } from './postings.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const addSource = ( overrides: Partial< StoredGmailSource > = {} ): StoredGmailSource => {
  const source: StoredGmailSource = {
    id: crypto.randomUUID(),
    name: 'Source',
    match: { kind: 'labels', label_ids: [ 'L1' ] },
    destination: 'newsletter',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    sync_from: '2026-10-19T10:00:00.000Z',
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: '2026-10-19T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }

  insertSource( userId, source )

  return source
}

const buildMessage = (
  sourceId: string,
  overrides: Partial< StoredGmailMessage > = {},
): StoredGmailMessage => {
  return {
    id: crypto.randomUUID(),
    source_id: sourceId,
    message_id: crypto.randomUUID(),
    subject: 'A subject',
    sender: 'Lenny',
    sender_address: 'lenny@example.com',
    received_at: '2026-10-19T09:00:00.000Z',
    body_html: '<p>Hello</p>',
    body_text: 'Hello',
    status: 'inbox',
    backfilled: false,
    attempts: 0,
    error: null,
    job_id: null,
    added_at: '2026-10-19T10:00:00.000Z',
    ...overrides,
  }
}

const addMessage = (
  sourceId: string,
  overrides: Partial< StoredGmailMessage > = {},
): StoredGmailMessage => {
  const message = buildMessage( sourceId, overrides )

  insertMessageIfNew( userId, message )

  return message
}

describe( 'insertMessageIfNew and findMessagesByIds', () => {
  it( 'inserts a message once and returns true, then false for the same Gmail id', () => {
    const source = addSource()
    const message = buildMessage( source.id )

    expect( insertMessageIfNew( userId, message ) ).toBe( true )
    expect( insertMessageIfNew(
      userId,
      { ...message, id: crypto.randomUUID(), subject: 'Other' },
    ) )
      .toBe( false )
    expect( findMessagesByIds( userId, [ message.id ] ) ).toEqual( [ message ] )
  } )

  it( 'keeps the first row when the same Gmail id arrives again', () => {
    const source = addSource()
    const message = addMessage( source.id )

    insertMessageIfNew( userId, { ...message, id: crypto.randomUUID(), subject: 'Changed' } )

    expect( findMessagesByIds( userId, [ message.id ] )[ 0 ]?.subject ).toBe( 'A subject' )
  } )

  it( 'accepts the same Gmail id for a different source', () => {
    const first = addSource()
    const second = addSource()
    const message = buildMessage( first.id )

    insertMessageIfNew( userId, message )

    expect( insertMessageIfNew(
      userId,
      buildMessage( second.id, { message_id: message.message_id } ),
    ) )
      .toBe( true )
  } )

  it( 'round-trips backfilled, a job id and missing bodies', () => {
    const source = addSource()
    const message = addMessage( source.id, {
      backfilled: true,
      job_id: crypto.randomUUID(),
      body_html: null,
      body_text: null,
      status: 'queued',
    } )

    expect( findMessagesByIds( userId, [ message.id ] ) ).toEqual( [ message ] )
  } )

  it( 'returns only the rows asked for, and nothing for no ids', () => {
    const source = addSource()
    const first = addMessage( source.id )
    addMessage( source.id )

    expect( findMessagesByIds( userId, [ first.id, crypto.randomUUID() ] ) ).toEqual( [ first ] )
    expect( findMessagesByIds( userId, [] ) ).toEqual( [] )
  } )
} )

describe( 'listNewsletterInbox', () => {
  it( 'lists inbox rows of newsletter sources with the source name, newest added first', () => {
    const source = addSource( { name: 'Lenny' } )
    const older = addMessage( source.id, { added_at: '2026-10-19T10:00:00.000Z' } )
    const newer = addMessage( source.id, { added_at: '2026-10-19T11:00:00.000Z' } )

    expect( listNewsletterInbox( userId ) ).toEqual( [
      { ...newer, source_name: 'Lenny' },
      { ...older, source_name: 'Lenny' },
    ] )
  } )

  it( 'breaks added_at ties by insertion order, newest first', () => {
    const source = addSource()
    const first = addMessage( source.id )
    const second = addMessage( source.id )

    expect( listNewsletterInbox( userId ).map( ( { id } ) => id ) )
      .toEqual( [ second.id, first.id ] )
  } )

  it( 'leaves out other statuses and rows of jobs sources', () => {
    const newsletter = addSource()
    const jobs = addSource( { destination: 'jobs' } )

    addMessage( newsletter.id, { status: 'dismissed' } )
    addMessage( newsletter.id, { status: 'queued' } )
    addMessage( newsletter.id, { status: 'skipped' } )
    addMessage( jobs.id, { status: 'inbox' } )

    expect( listNewsletterInbox( userId ) ).toEqual( [] )
  } )

  it( 'still lists rows of a deleted source', () => {
    const source = addSource( { deleted_at: '2026-10-20T10:00:00.000Z' } )
    const message = addMessage( source.id )

    expect( listNewsletterInbox( userId ).map( ( { id } ) => id ) ).toEqual( [ message.id ] )
  } )
} )

describe( 'setMessageStatus', () => {
  it( 'sets status and job id on the given rows only', () => {
    const source = addSource()
    const first = addMessage( source.id )
    const second = addMessage( source.id )
    const other = addMessage( source.id )
    const jobId = crypto.randomUUID()

    setMessageStatus( userId, [ first.id, second.id ], 'queued', jobId )

    const rows = findMessagesByIds( userId, [ first.id, second.id, other.id ] )
    expect( rows.map( ( { status, job_id } ) => [ status, job_id ] ) )
      .toEqual( [ [ 'queued', jobId ], [ 'queued', jobId ], [ 'inbox', null ] ] )
  } )

  it( 'clears the bodies when a newsletter row leaves the inbox', () => {
    const source = addSource()
    const message = addMessage( source.id )

    setMessageStatus( userId, [ message.id ], 'dismissed' )

    expect( findMessagesByIds( userId, [ message.id ] )[ 0 ] )
      .toMatchObject( { status: 'dismissed', body_html: null, body_text: null } )
  } )

  it( 'keeps the bodies of a newsletter row that stays in the inbox', () => {
    const source = addSource()
    const message = addMessage( source.id )

    setMessageStatus( userId, [ message.id ], 'inbox' )

    expect( findMessagesByIds( userId, [ message.id ] )[ 0 ] )
      .toMatchObject( { body_html: '<p>Hello</p>', body_text: 'Hello' } )
  } )

  it( 'keeps the bodies of a jobs row whatever its status', () => {
    const source = addSource( { destination: 'jobs' } )
    const message = addMessage( source.id, { status: 'pending' } )

    setMessageStatus( userId, [ message.id ], 'extracted' )

    expect( findMessagesByIds( userId, [ message.id ] )[ 0 ] )
      .toMatchObject( { status: 'extracted', body_html: '<p>Hello</p>', body_text: 'Hello' } )
  } )

  it( 'does nothing for no ids', () => {
    expect( () => setMessageStatus( userId, [], 'dismissed' ) ).not.toThrow()
  } )
} )

describe( 'listPendingAlerts', () => {
  it( 'returns pending rows and failed rows under three attempts, oldest received first', () => {
    const source = addSource( { destination: 'jobs' } )
    const pending = addMessage( source.id, {
      status: 'pending',
      received_at: '2026-10-19T08:00:00.000Z',
    } )
    const retry = addMessage( source.id, {
      status: 'failed',
      attempts: 2,
      received_at: '2026-10-19T07:00:00.000Z',
    } )

    addMessage( source.id, { status: 'failed', attempts: 3 } )
    addMessage( source.id, { status: 'extracted' } )
    addMessage( source.id, { status: 'no_jobs' } )
    addMessage( source.id, { status: 'skipped' } )

    expect( listPendingAlerts( userId, source.id, 20 ).map( ( { id } ) => id ) )
      .toEqual( [ retry.id, pending.id ] )
  } )

  it( 'honours the limit and the source', () => {
    const source = addSource( { destination: 'jobs' } )
    const other = addSource( { destination: 'jobs' } )

    for( let index = 0; index < 3; index += 1 ) {
      addMessage( source.id, {
        status: 'pending',
        received_at: `2026-10-19T0${ index }:00:00.000Z`,
      } )
    }

    addMessage( other.id, { status: 'pending' } )

    expect( listPendingAlerts( userId, source.id, 2 ) ).toHaveLength( 2 )
    expect( listPendingAlerts( userId, other.id, 20 ) ).toHaveLength( 1 )
  } )
} )

describe( 'recordAttempt', () => {
  it( 'sets status and error and counts the attempt', () => {
    const source = addSource( { destination: 'jobs' } )
    const message = addMessage( source.id, { status: 'pending' } )

    recordAttempt( userId, message.id, { status: 'failed', error: 'Malformed output' } )
    recordAttempt( userId, message.id, { status: 'extracted', error: null } )

    expect( findMessagesByIds( userId, [ message.id ] )[ 0 ] )
      .toMatchObject( { status: 'extracted', error: null, attempts: 2 } )
  } )
} )

describe( 'listAlertEmails', () => {
  const addPosting = ( messageRowId: string, key: string ): void => {
    upsertPosting(
      userId,
      {
        id: crypto.randomUUID(),
        platform: 'upwork',
        platform_job_id: null,
        dedupe_key: key,
        title: 'T',
        url: 'https://example.com/j',
        posted_at: null,
        details: {
          budget: null,
          skills: [],
          description: null,
          experience_level: null,
          duration: null,
          proposals: null,
          client: null,
          extra: [],
        },
      },
      messageRowId,
      '2026-10-19T09:00:00.000Z',
    )
  }

  it( 'lists emails of jobs sources newest received first, with source name and counts', () => {
    const source = addSource( { destination: 'jobs', name: 'Upwork alerts' } )
    const newsletter = addSource()
    const older = addMessage( source.id, {
      status: 'extracted',
      received_at: '2026-10-18T09:00:00.000Z',
    } )
    const newer = addMessage( source.id, { status: 'pending' } )

    addMessage( newsletter.id )
    addMessage( source.id, { status: 'skipped' } )
    addPosting( older.id, 'upwork:1' )
    addPosting( older.id, 'upwork:2' )

    const { rows, total } = listAlertEmails( userId, { limit: 50, offset: 0 } )

    expect( total ).toBe( 2 )
    expect( rows ).toEqual( [
      {
        id: newer.id,
        source_id: source.id,
        source_name: 'Upwork alerts',
        message_id: newer.message_id,
        subject: 'A subject',
        sender: 'Lenny',
        received_at: newer.received_at,
        status: 'pending',
        postings_count: 0,
        attempts: 0,
        error: null,
      },
      {
        id: older.id,
        source_id: source.id,
        source_name: 'Upwork alerts',
        message_id: older.message_id,
        subject: 'A subject',
        sender: 'Lenny',
        received_at: older.received_at,
        status: 'extracted',
        postings_count: 2,
        attempts: 0,
        error: null,
      },
    ] )
  } )

  it( 'filters by status, and the total follows the filter', () => {
    const source = addSource( { destination: 'jobs' } )

    addMessage( source.id, { status: 'failed', error: 'boom', attempts: 3 } )
    addMessage( source.id, { status: 'extracted' } )
    addMessage( source.id, { status: 'extracted' } )

    const { rows, total } = listAlertEmails( userId, { status: 'failed', limit: 50, offset: 0 } )

    expect( total ).toBe( 1 )
    expect( rows ).toHaveLength( 1 )
    expect( rows[ 0 ] ).toMatchObject( { status: 'failed', error: 'boom', attempts: 3 } )
  } )

  it( 'pages with limit and offset while the total stays whole', () => {
    const source = addSource( { destination: 'jobs' } )

    for( let index = 1; index <= 5; index += 1 ) {
      addMessage( source.id, {
        status: 'extracted',
        subject: `Mail ${ index }`,
        received_at: `2026-10-19T0${ index }:00:00.000Z`,
      } )
    }

    const { rows, total } = listAlertEmails( userId, { limit: 2, offset: 1 } )

    expect( total ).toBe( 5 )
    expect( rows.map( ( { subject } ) => subject ) ).toEqual( [ 'Mail 4', 'Mail 3' ] )
  } )
} )

describe( 'countInbox', () => {
  it( 'counts the inbox rows of one source', () => {
    const source = addSource()
    const other = addSource()

    addMessage( source.id )
    addMessage( source.id )
    addMessage( source.id, { status: 'dismissed' } )
    addMessage( other.id )

    expect( countInbox( userId, source.id ) ).toBe( 2 )
    expect( countInbox( userId, crypto.randomUUID() ) ).toBe( 0 )
  } )
} )

describe( 'dismissInboxForSource', () => {
  it( 'dismisses inbox rows of that source and clears their bodies', () => {
    const source = addSource()
    const other = addSource()
    const inbox = addMessage( source.id )
    const queued = addMessage( source.id, { status: 'queued', body_html: null, body_text: null } )
    const kept = addMessage( other.id )

    dismissInboxForSource( userId, source.id )

    expect( findMessagesByIds( userId, [ inbox.id ] )[ 0 ] )
      .toMatchObject( { status: 'dismissed', body_html: null, body_text: null } )
    expect( findMessagesByIds( userId, [ queued.id ] )[ 0 ]?.status ).toBe( 'queued' )
    expect( findMessagesByIds( userId, [ kept.id ] )[ 0 ]?.status ).toBe( 'inbox' )
  } )
} )

describe( 'findStoredMessageIds', () => {
  it( 'returns the Gmail ids this source already has, whatever their status', () => {
    const source = addSource()
    const other = addSource()

    addMessage( source.id, { message_id: 'g1', status: 'inbox' } )
    addMessage( source.id, { message_id: 'g2', status: 'skipped' } )
    addMessage( other.id, { message_id: 'g3' } )

    expect( findStoredMessageIds( userId, source.id, [ 'g1', 'g2', 'g3', 'g4' ] ) )
      .toEqual( new Set( [ 'g1', 'g2' ] ) )
  } )

  it( 'returns nothing for no ids', () => {
    expect( findStoredMessageIds( userId, addSource().id, [] ) ).toEqual( new Set() )
  } )

  it( 'handles more ids than SQLite takes as parameters in one statement', () => {
    const source = addSource()
    const ids = Array.from( { length: 1500 }, ( _, index ) => `g${ index }` )

    addMessage( source.id, { message_id: 'g1499' } )

    expect( findStoredMessageIds( userId, source.id, ids ) ).toEqual( new Set( [ 'g1499' ] ) )
  } )
} )

describe( 'ownership', () => {
  it( 'keeps each user\'s messages, inbox and counts apart', () => {
    const other = createTestUser().id
    const source = addSource()
    const message = addMessage( source.id )

    expect( findMessagesByIds( other, [ message.id ] ) ).toEqual( [] )
    expect( findStoredMessageIds( other, source.id, [ message.message_id ] ).size ).toBe( 0 )
    expect( listNewsletterInbox( other ) ).toEqual( [] )
    expect( listPendingAlerts( other, source.id, 10 ) ).toEqual( [] )
    expect( listAlertEmails( other, { limit: 10, offset: 0 } ).total ).toBe( 0 )
    expect( countInbox( other, source.id ) ).toBe( 0 )
    expect( listNewsletterInbox( userId ).map( ( { id } ) => id ) ).toEqual( [ message.id ] )
  } )

  it( 'does not change another user\'s messages', () => {
    const other = createTestUser().id
    const source = addSource()
    const message = addMessage( source.id )

    setMessageStatus( other, [ message.id ], 'dismissed' )
    recordAttempt( other, message.id, { status: 'failed', error: 'x' } )
    dismissInboxForSource( other, source.id )

    expect( findMessagesByIds( userId, [ message.id ] ) ).toEqual( [ message ] )
  } )
} )
