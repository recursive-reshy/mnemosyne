// Packages
import { describe, it, expect } from 'vitest'
// Test support
import { createTestUser } from '../test-support/auth.js'
// Repositories
import {
  findJobById,
  insertJob,
  updateJob,
} from './jobStore.repository.js'
import type { StoredJob } from './jobStore.repository.js'
import { insertFeed } from './feeds.repository.js'
import type { StoredFeed } from './feeds.repository.js'
import { saveAccount, setAccountStatus } from './gmailAccount.repository.js'
import { insertSource } from './gmailSources.repository.js'
import type { StoredGmailSource } from './gmailSources.repository.js'
import {
  findExpiredJobs,
  findNextRunnableJob,
  listDueFeeds,
  listDueGmailSources,
  markInterruptedJobs,
  markInterruptedLinkingJobs,
} from './system.repository.js'
// Test support
import { seedCheck } from '../test-support/health.fixture.js'

const buildJob = ( overrides: Partial< StoredJob > = {} ): StoredJob => {
  return {
    id: crypto.randomUUID(),
    url: 'https://www.youtube.com/watch?v=abc',
    status: 'queued',
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
    title: null,
    note_markdown: null,
    target_folder: null,
    expires_at: null,
    saved_path: null,
    summary_model: null,
    prompt_profile_id: null,
    source_document: null,
    link_state: null,
    link_error: null,
    source_type: 'video',
    feed_id: null,
    feed_name: null,
    gmail_source_id: null,
    gmail_source_name: null,
    ...overrides,
  }
}

describe( 'findNextRunnableJob', () => {
  it( 'returns the earliest-inserted queued job with its owner, skipping other statuses', () => {
    const { id: userId } = createTestUser()
    const downloading = buildJob( { status: 'downloading' } )
    const firstQueued = buildJob()
    const secondQueued = buildJob()
    insertJob( userId, downloading )
    insertJob( userId, firstQueued )
    insertJob( userId, secondQueued )

    expect( findNextRunnableJob() ).toEqual( { ...firstQueued, user_id: userId } )
  } )

  it( 'also returns summarizing jobs, oldest first', () => {
    const { id: userId } = createTestUser()
    const summarizing = buildJob( { status: 'summarizing' } )
    const queued = buildJob()
    insertJob( userId, buildJob( { status: 'ready_for_review' } ) )
    insertJob( userId, summarizing )
    insertJob( userId, queued )

    expect( findNextRunnableJob() ).toEqual( { ...summarizing, user_id: userId } )

    updateJob( userId, summarizing.id, { status: 'summary_failed' } )

    expect( findNextRunnableJob() ).toEqual( { ...queued, user_id: userId } )
  } )

  it( 'also returns linking jobs, oldest first', () => {
    const { id: userId } = createTestUser()
    const linking = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( userId, buildJob( { status: 'ready_for_review', link_state: 'linked' } ) )
    insertJob( userId, linking )
    insertJob( userId, buildJob() )

    expect( findNextRunnableJob() ).toEqual( { ...linking, user_id: userId } )
  } )

  it( 'returns undefined when no job is runnable', () => {
    const { id: userId } = createTestUser()
    insertJob( userId, buildJob( { status: 'failed' } ) )
    insertJob( userId, buildJob( { status: 'summary_failed' } ) )
    insertJob( userId, buildJob( { status: 'saved' } ) )

    expect( findNextRunnableJob() ).toBeUndefined()
  } )

  it( 'looks across users, oldest first, and says whose job it is', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const theirs = buildJob()
    const mine = buildJob()
    insertJob( second, theirs )
    insertJob( first, mine )

    expect( findNextRunnableJob() ).toEqual( { ...theirs, user_id: second } )

    updateJob( second, theirs.id, { status: 'failed' } )

    expect( findNextRunnableJob() ).toEqual( { ...mine, user_id: first } )
  } )
} )

describe( 'markInterruptedJobs', () => {
  const statuses = [
    'queued',
    'downloading',
    'converting',
    'transcribing',
    'summarizing',
    'ready_for_review',
    'summary_failed',
    'saved',
    'failed',
  ] as const
  const interrupted = [ 'downloading', 'converting', 'transcribing' ]

  it( 'fails only the download, convert and transcribe jobs', () => {
    const { id: userId } = createTestUser()
    const ids = new Map( statuses.map( ( status ) => {
      const job = buildJob( { status } )
      insertJob( userId, job )

      return [ status, job.id ] as const
    } ) )

    const count = markInterruptedJobs( 'Interrupted by restart', '2026-10-15T09:00:00.000Z' )

    expect( count ).toBe( 3 )

    for( const status of statuses ) {
      const job = findJobById( userId, ids.get( status ) ?? '' )

      if( interrupted.includes( status ) ) {
        expect( job ).toMatchObject( {
          status: 'failed',
          error: 'Interrupted by restart',
          updated_at: '2026-10-15T09:00:00.000Z',
        } )
      } else {
        expect( job ).toMatchObject( { status, error: null } )
        expect( job?.updated_at ).toBe( '2026-10-14T10:00:00.000Z' )
      }
    }
  } )

  it( 'fails the interrupted jobs of every user', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'downloading' } )
    const two = buildJob( { status: 'converting' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 2 )
    expect( findJobById( first, one.id )?.status ).toBe( 'failed' )
    expect( findJobById( second, two.id )?.status ).toBe( 'failed' )
  } )

  it( 'returns 0 when nothing was interrupted', () => {
    insertJob( createTestUser().id, buildJob() )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
  } )

  it( 'leaves a linking job alone', () => {
    const { id: userId } = createTestUser()
    const job = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( userId, job )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
    expect( findJobById( userId, job.id )?.status ).toBe( 'linking' )
  } )
} )

describe( 'markInterruptedLinkingJobs', () => {
  it( 'moves linking jobs to review as failed, and only those', () => {
    const { id: userId } = createTestUser()
    const linking = buildJob( { status: 'linking', link_state: 'pending' } )
    const summarizing = buildJob( { status: 'summarizing' } )
    insertJob( userId, linking )
    insertJob( userId, summarizing )

    const count = markInterruptedLinkingJobs(
      'Interrupted by restart',
      '2026-10-15T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
    )

    expect( count ).toBe( 1 )
    expect( findJobById( userId, linking.id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
      link_error: 'Interrupted by restart',
      expires_at: '2026-10-16T09:00:00.000Z',
      updated_at: '2026-10-15T09:00:00.000Z',
    } )
    expect( findJobById( userId, summarizing.id )?.status ).toBe( 'summarizing' )
  } )

  it( 'covers the linking jobs of every user', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'linking', link_state: 'pending' } )
    const two = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( markInterruptedLinkingJobs(
      'x',
      '2026-10-15T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
    ) )
      .toBe( 2 )
  } )
} )

describe( 'findExpiredJobs', () => {
  const now = '2026-10-15T12:00:00.000Z'

  it( 'returns review and failed-summary jobs whose expiry has passed', () => {
    const { id: userId } = createTestUser()
    const review = buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T11:59:59.000Z',
    } )
    const failed = buildJob( { status: 'summary_failed', expires_at: now } )
    insertJob( userId, review )
    insertJob( userId, failed )

    expect( findExpiredJobs( now ).map( ( { id } ) => id ).toSorted() ).toEqual(
      [ review.id, failed.id ].toSorted(),
    )
  } )

  it( 'ignores unexpired jobs, null expiry and other statuses', () => {
    const { id: userId } = createTestUser()
    insertJob( userId, buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T12:00:01.000Z',
    } ) )
    insertJob( userId, buildJob( { status: 'ready_for_review', expires_at: null } ) )
    insertJob( userId, buildJob( { status: 'saved', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( userId, buildJob( { status: 'failed', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( userId, buildJob( {
      status: 'summarizing',
      expires_at: '2026-10-01T00:00:00.000Z',
    } ) )

    expect( findExpiredJobs( now ) ).toEqual( [] )
  } )

  it( 'returns the expired jobs of every user, each with its owner', () => {
    const first = createTestUser().id
    const second = createTestUser().id
    const one = buildJob( { status: 'ready_for_review', expires_at: '2026-10-15T10:00:00.000Z' } )
    const two = buildJob( { status: 'ready_for_review', expires_at: '2026-10-15T10:00:00.000Z' } )
    insertJob( first, one )
    insertJob( second, two )

    expect( findExpiredJobs( now ).map( ( { id, user_id } ) => [ id, user_id ] ).toSorted() )
      .toEqual( [ [ one.id, first ], [ two.id, second ] ].toSorted() )
  } )
} )

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
    created_at: '2026-10-18T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const addFeed = ( userId: string, feed: StoredFeed ): StoredFeed => {
  insertFeed( userId, feed )
  seedCheck( 'feed', feed.id, feed.last_checked_at, feed.last_error )

  return feed
}

describe( 'listDueFeeds', () => {
  const now = '2026-10-18T12:00:00.000Z'

  it( 'returns enabled feeds never checked or last checked before now minus the interval', () => {
    const { id: userId } = createTestUser()

    for( const feed of [
      buildFeed( { name: 'never' } ),
      buildFeed( { name: 'old', last_checked_at: '2026-10-18T10:59:59.000Z' } ),
      buildFeed( { name: 'edge', last_checked_at: '2026-10-18T11:00:00.000Z' } ),
      buildFeed( { name: 'recent', last_checked_at: '2026-10-18T11:30:00.000Z' } ),
    ] ) {
      addFeed( userId, feed )
    }

    expect( listDueFeeds( now, 60 ).map( ( { name } ) => name ).sort() )
      .toEqual( [ 'edge', 'never', 'old' ] )
  } )

  it( 'leaves out disabled and deleted feeds', () => {
    const { id: userId } = createTestUser()

    addFeed( userId, buildFeed( { enabled: false } ) )
    addFeed( userId, buildFeed( { deleted_at: '2026-10-18T12:00:00.000Z' } ) )

    expect( listDueFeeds( now, 60 ) ).toEqual( [] )
  } )

  it( 'honours the interval it is given', () => {
    const { id: userId } = createTestUser()

    addFeed( userId, buildFeed( { last_checked_at: '2026-10-18T11:30:00.000Z' } ) )

    expect( listDueFeeds( now, 60 ) ).toHaveLength( 0 )
    expect( listDueFeeds( now, 15 ) ).toHaveLength( 1 )
  } )

  it( 'returns the least recently checked first, across users, each with its owner', () => {
    const first = createTestUser().id
    const second = createTestUser().id

    addFeed( first, buildFeed( { name: 'b', last_checked_at: '2026-10-18T09:00:00.000Z' } ) )
    addFeed( second, buildFeed( { name: 'a', last_checked_at: '2026-10-18T08:00:00.000Z' } ) )
    addFeed( first, buildFeed( { name: 'never' } ) )

    expect( listDueFeeds( now, 60 ).map( ( { name, user_id } ) => [ name, user_id ] ) )
      .toEqual( [ [ 'never', first ], [ 'a', second ], [ 'b', first ] ] )
  } )
} )

const buildSource = ( overrides: Partial< StoredGmailSource > = {} ): StoredGmailSource => {
  return {
    id: crypto.randomUUID(),
    name: 'Upwork alerts',
    match: { kind: 'labels', label_ids: [ 'Label_1' ] },
    destination: 'jobs',
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
}

const connect = ( userId: string ): void => {
  saveAccount( userId, {
    email: `${ userId }@example.com`,
    refresh_token_enc: 'v1:x',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
  } )
}

const addSource = ( userId: string, source: StoredGmailSource ): StoredGmailSource => {
  insertSource( userId, source )
  seedCheck( 'gmail_source', source.id, source.last_checked_at, source.last_error )

  return source
}

describe( 'listDueGmailSources', () => {
  const now = '2026-10-19T12:00:00.000Z'

  it( 'returns sources never checked or last checked at least one interval ago', () => {
    const { id: userId } = createTestUser()

    connect( userId )

    for( const source of [
      buildSource( { name: 'recent', last_checked_at: '2026-10-19T11:30:00.000Z' } ),
      buildSource( { name: 'old', last_checked_at: '2026-10-19T09:00:00.000Z' } ),
      buildSource( { name: 'exact', last_checked_at: '2026-10-19T11:00:00.000Z' } ),
      buildSource( { name: 'never' } ),
      buildSource( { name: 'disabled', enabled: false } ),
      buildSource( { name: 'deleted', deleted_at: '2026-10-19T08:00:00.000Z' } ),
    ] ) {
      addSource( userId, source )
    }

    expect( listDueGmailSources( now, 60 ).map( ( { name } ) => name ) )
      .toEqual( [ 'never', 'old', 'exact' ] )
  } )

  it( 'honours the interval', () => {
    const { id: userId } = createTestUser()

    connect( userId )
    addSource( userId, buildSource( { last_checked_at: '2026-10-19T11:30:00.000Z' } ) )

    expect( listDueGmailSources( now, 60 ) ).toHaveLength( 0 )
    expect( listDueGmailSources( now, 30 ) ).toHaveLength( 1 )
  } )

  it( 'only returns sources whose owner has a connected Gmail account', () => {
    const connected = createTestUser().id
    const broken = createTestUser().id
    const never = createTestUser().id

    connect( connected )
    connect( broken )
    setAccountStatus( broken, 'reconnect_needed', 'Revoked' )

    addSource( connected, buildSource( { name: 'ok' } ) )
    addSource( broken, buildSource( { name: 'broken' } ) )
    addSource( never, buildSource( { name: 'never connected' } ) )

    expect( listDueGmailSources( now, 60 ).map( ( { name, user_id } ) => [ name, user_id ] ) )
      .toEqual( [ [ 'ok', connected ] ] )
  } )
} )
