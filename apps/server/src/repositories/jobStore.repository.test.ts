// Node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import Database from 'better-sqlite3'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Test support
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Repositories
import { closeDatabase, getDatabase, openDatabase } from './database.js'
import { insertLinkRun, listLinkRuns } from './linkRuns.repository.js'
import { insertSuggestions, listSuggestions } from './linkSuggestions.repository.js'
import { findLatestVersion, findProfileBySeedKey } from './promptProfiles.repository.js'
import {
  StoredJob,
  clearJobs,
  deleteJob,
  findExpiredJobs,
  findJobById,
  findNextRunnableJob,
  insertJob,
  listActiveJobs,
  markInterruptedJobs,
  updateJob,
} from './jobStore.repository.js'

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

beforeEach( () => {
  clearJobs()
} )

describe( 'link fields', () => {
  it( 'round-trips link_state and link_error through insert and update', () => {
    const job = buildJob( { link_state: 'pending' } )
    insertJob( job )

    expect( findJobById( job.id ) ).toMatchObject( { link_state: 'pending', link_error: null } )

    updateJob( job.id, { link_state: 'failed', link_error: 'Timed out' } )

    expect( findJobById( job.id ) )
      .toMatchObject( { link_state: 'failed', link_error: 'Timed out' } )
  } )

  it( 'does not touch markInterruptedJobs\' statuses: a linking job is left alone', () => {
    const job = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( job )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
    expect( findJobById( job.id )?.status ).toBe( 'linking' )
  } )
} )

describe( 'insertJob and findJobById', () => {
  it( 'returns an equal job after insert', () => {
    const job = buildJob()

    insertJob( job )

    expect( findJobById( job.id ) ).toEqual( job )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findJobById( 'missing' ) ).toBeUndefined()
  } )

  it( 'throws when the id already exists', () => {
    const job = buildJob()
    insertJob( job )

    expect( () => insertJob( job ) ).toThrow()
  } )
} )

describe( 'updateJob', () => {
  it( 'merges changes and returns the updated job', () => {
    const job = buildJob()
    insertJob( job )

    const updated = updateJob( job.id, { status: 'downloading' } )

    expect( updated ).toEqual( { ...job, status: 'downloading' } )
    expect( findJobById( job.id ) ).toEqual( { ...job, status: 'downloading' } )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( updateJob( 'missing', { status: 'failed' } ) ).toBeUndefined()
  } )
} )

describe( 'findNextRunnableJob', () => {
  it( 'returns the earliest-inserted queued job, skipping other statuses', () => {
    const downloading = buildJob( { status: 'downloading' } )
    const firstQueued = buildJob()
    const secondQueued = buildJob()
    insertJob( downloading )
    insertJob( firstQueued )
    insertJob( secondQueued )

    expect( findNextRunnableJob() ).toEqual( firstQueued )
  } )

  it( 'also returns summarizing jobs, oldest first', () => {
    const summarizing = buildJob( { status: 'summarizing' } )
    const queued = buildJob()
    insertJob( buildJob( { status: 'ready_for_review' } ) )
    insertJob( summarizing )
    insertJob( queued )

    expect( findNextRunnableJob() ).toEqual( summarizing )

    updateJob( summarizing.id, { status: 'summary_failed' } )

    expect( findNextRunnableJob() ).toEqual( queued )
  } )

  it( 'also returns linking jobs, oldest first', () => {
    const linking = buildJob( { status: 'linking', link_state: 'pending' } )
    insertJob( buildJob( { status: 'ready_for_review', link_state: 'linked' } ) )
    insertJob( linking )
    insertJob( buildJob() )

    expect( findNextRunnableJob() ).toEqual( linking )
  } )

  it( 'returns undefined when no job is runnable', () => {
    insertJob( buildJob( { status: 'failed' } ) )
    insertJob( buildJob( { status: 'summary_failed' } ) )
    insertJob( buildJob( { status: 'saved' } ) )

    expect( findNextRunnableJob() ).toBeUndefined()
  } )
} )

describe( 'no shared references', () => {
  it( 'ignores mutation of the object passed to insertJob', () => {
    const job = buildJob()
    insertJob( job )

    job.status = 'failed'

    expect( findJobById( job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of the object returned by findJobById', () => {
    const job = buildJob()
    insertJob( job )

    const found = findJobById( job.id )
    if( found ) found.status = 'failed'

    expect( findJobById( job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of the object returned by updateJob', () => {
    const job = buildJob()
    insertJob( job )

    const updated = updateJob( job.id, { error: 'x' } )
    if( updated ) updated.error = 'changed'

    expect( findJobById( job.id )?.error ).toBe( 'x' )
  } )

  it( 'ignores mutation of the object returned by findNextRunnableJob', () => {
    const job = buildJob()
    insertJob( job )

    const next = findNextRunnableJob()
    if( next ) next.status = 'failed'

    expect( findJobById( job.id )?.status ).toBe( 'queued' )
  } )

  it( 'ignores mutation of a nested transcript', () => {
    const transcript = {
      meta: {
        title: 'T',
        source: 'https://example.com/v',
        channel: 'C',
        duration_seconds: 1,
        transcribed_at: '2026-10-14T10:00:00.000Z',
        model: 'm',
      },
      segments: [ { start: 0, end: 1, text: 'hi' } ],
    }
    const job = buildJob( { source_document: { kind: 'video', ...transcript } } )
    insertJob( job )

    transcript.segments[ 0 ].text = 'changed'

    expect( findJobById( job.id )?.source_document ).toMatchObject( {
      segments: [ { text: 'hi' } ],
    } )
  } )
} )

describe( 'source type, feed and source document', () => {
  const article = {
    kind: 'article',
    meta: {
      title: 'A post',
      source: 'https://example.com/post',
      author: null,
      site: 'Example',
      published: '2026-10-01',
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: 'Some text.',
  } as const

  const addFeed = ( id: string, name: string, deletedAt: string | null = null ): void => {
    getDatabase().prepare( `INSERT INTO feeds ( id, url, feed_url, name, created_at, deleted_at )
      VALUES ( ?, 'https://a.example', ?, ?, '2026-10-18T10:00:00.000Z', ? )` )
      .run( id, `https://a.example/${ id }`, name, deletedAt )
  }

  it( 'round-trips an article document, its source type and its feed id', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'A blog' )
    const job = buildJob( {
      source_type: 'article',
      feed_id: feedId,
      feed_name: 'A blog',
      source_document: article,
    } )

    insertJob( job )

    expect( findJobById( job.id ) ).toEqual( job )
  } )

  it( 'defaults to a video job with no feed', () => {
    const job = buildJob()

    insertJob( job )

    expect( findJobById( job.id ) ).toMatchObject( {
      source_type: 'video',
      feed_id: null,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } )
  } )

  it( 'stores a video document with its kind', () => {
    const job = buildJob( { source_document: { kind: 'video', ...transcriptFixture } } )
    insertJob( job )

    const { source_document: stored } = getDatabase()
      .prepare( 'SELECT source_document FROM jobs WHERE id = ?' )
      .get( job.id ) as { source_document: string }

    expect( JSON.parse( stored ) ).toMatchObject( { kind: 'video' } )
  } )

  it( 'rejects a stored document with no kind', () => {
    const job = buildJob()
    insertJob( job )
    getDatabase().prepare( 'UPDATE jobs SET source_document = ? WHERE id = ?' )
      .run( JSON.stringify( transcriptFixture ), job.id )

    expect( () => findJobById( job.id ) ).toThrow()
  } )

  it( 'gives every read the feed name from the feeds table', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'A blog' )
    const job = buildJob( { source_type: 'article', feed_id: feedId, feed_name: 'A blog' } )
    insertJob( job )

    expect( findJobById( job.id )?.feed_name ).toBe( 'A blog' )
    expect( listActiveJobs()[ 0 ]?.feed_name ).toBe( 'A blog' )
    expect( findNextRunnableJob()?.feed_name ).toBe( 'A blog' )
  } )

  it( 'keeps the name of a deleted feed', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'Gone', '2026-10-18T12:00:00.000Z' )
    insertJob( buildJob( { feed_id: feedId, feed_name: 'Gone' } ) )

    expect( listActiveJobs()[ 0 ]?.feed_name ).toBe( 'Gone' )
  } )

  it( 'has no feed name when the feed row is missing', () => {
    const job = buildJob( { feed_id: crypto.randomUUID() } )
    insertJob( job )

    expect( findJobById( job.id )?.feed_name ).toBeNull()
  } )

  it( 'does not write feed_name: it follows the feed', () => {
    const feedId = crypto.randomUUID()
    addFeed( feedId, 'Old' )
    const job = buildJob( { feed_id: feedId } )
    insertJob( job )

    getDatabase().prepare( 'UPDATE feeds SET name = ? WHERE id = ?' ).run( 'New', feedId )
    updateJob( job.id, { title: 'T', feed_name: 'Stale' } )

    expect( findJobById( job.id )?.feed_name ).toBe( 'New' )
  } )

  const addGmailSource = ( id: string, name: string, deletedAt: string | null = null ): void => {
    getDatabase().prepare( `INSERT INTO gmail_sources (
        id, name, match_kind, label_ids, destination, sync_from, created_at, deleted_at
      ) VALUES ( ?, ?, 'labels', '["L1"]', 'newsletter', '2026-10-18T10:00:00.000Z',
        '2026-10-18T10:00:00.000Z', ? )` ).run( id, name, deletedAt )
  }

  it( 'round-trips the Gmail source id and name', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Lenny' )
    const job = buildJob( {
      source_type: 'article',
      gmail_source_id: sourceId,
      gmail_source_name: 'Lenny',
      source_document: article,
    } )

    insertJob( job )

    expect( findJobById( job.id ) ).toEqual( job )
  } )

  it( 'stores the Gmail source id and can change it with updateJob', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Lenny' )
    const job = buildJob()
    insertJob( job )

    expect( updateJob( job.id, { gmail_source_id: sourceId } )?.gmail_source_id )
      .toBe( sourceId )
    expect( getDatabase().prepare( 'SELECT gmail_source_id FROM jobs WHERE id = ?' ).get( job.id ) )
      .toEqual( { gmail_source_id: sourceId } )
  } )

  it( 'gives every read the Gmail source name from the gmail_sources table', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Lenny' )
    const job = buildJob( { source_type: 'article', gmail_source_id: sourceId } )
    insertJob( job )

    expect( findJobById( job.id )?.gmail_source_name ).toBe( 'Lenny' )
    expect( listActiveJobs()[ 0 ]?.gmail_source_name ).toBe( 'Lenny' )
    expect( findNextRunnableJob()?.gmail_source_name ).toBe( 'Lenny' )
  } )

  it( 'keeps the name of a deleted Gmail source', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Gone', '2026-10-18T12:00:00.000Z' )
    insertJob( buildJob( { gmail_source_id: sourceId } ) )

    expect( listActiveJobs()[ 0 ]?.gmail_source_name ).toBe( 'Gone' )
  } )

  it( 'has no Gmail source name when the source row is missing', () => {
    const job = buildJob( { gmail_source_id: crypto.randomUUID() } )
    insertJob( job )

    expect( findJobById( job.id )?.gmail_source_name ).toBeNull()
  } )

  it( 'does not write gmail_source_name: it follows the source', () => {
    const sourceId = crypto.randomUUID()
    addGmailSource( sourceId, 'Old' )
    const job = buildJob( { gmail_source_id: sourceId } )
    insertJob( job )

    getDatabase().prepare( 'UPDATE gmail_sources SET name = ? WHERE id = ?' ).run( 'New', sourceId )
    updateJob( job.id, { title: 'T', gmail_source_name: 'Stale' } )

    expect( findJobById( job.id )?.gmail_source_name ).toBe( 'New' )
  } )
} )

describe( 'clearJobs', () => {
  it( 'empties the store', () => {
    const job = buildJob()
    insertJob( job )

    clearJobs()

    expect( findJobById( job.id ) ).toBeUndefined()
    expect( findNextRunnableJob() ).toBeUndefined()
  } )
} )

describe( 'summary choices', () => {
  it( 'round-trips summary_model and prompt_profile_id', () => {
    const job = buildJob( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: crypto.randomUUID(),
    } )

    insertJob( job )

    expect( findJobById( job.id ) ).toEqual( job )
  } )

  it( 'defaults both to null', () => {
    const job = buildJob()

    insertJob( job )

    expect( findJobById( job.id ) )
      .toMatchObject( { summary_model: null, prompt_profile_id: null } )
  } )

  it( 'updates both and can clear them', () => {
    const job = buildJob()
    const profileId = crypto.randomUUID()
    insertJob( job )

    updateJob( job.id, { summary_model: 'm', prompt_profile_id: profileId } )

    expect( findJobById( job.id ) ).toMatchObject( {
      summary_model: 'm',
      prompt_profile_id: profileId,
    } )

    updateJob( job.id, { summary_model: null, prompt_profile_id: null } )

    expect( findJobById( job.id ) )
      .toMatchObject( { summary_model: null, prompt_profile_id: null } )
  } )

  it( 'keeps them in listActiveJobs and findNextRunnableJob', () => {
    const job = buildJob( { status: 'summarizing', summary_model: 'm' } )
    insertJob( job )

    expect( listActiveJobs()[ 0 ]?.summary_model ).toBe( 'm' )
    expect( findNextRunnableJob()?.summary_model ).toBe( 'm' )
  } )
} )

describe( 'storage', () => {
  const transcript = {
    meta: {
      title: 'Ünïcode "quotes" and\nnewlines 日本語',
      source: 'https://www.youtube.com/watch?v=abc',
      channel: 'Some Channel',
      duration_seconds: 60,
      transcribed_at: '2026-10-14T10:04:00.000Z',
      model: 'large-v3',
    },
    segments: [ { start: 0, end: 1.5, text: 'Hello' } ],
  }

  beforeEach( () => {
    openDatabase( ':memory:' )
  } )

  afterEach( () => {
    closeDatabase()
  } )

  it( 'round-trips the transcript and every field', () => {
    const job = buildJob( {
      title: transcript.meta.title,
      expires_at: '2026-10-15T10:00:00.000Z',
      note_markdown: '---\ntitle: "A talk"\n---\n\nText\n',
      target_folder: 'Learning/AI',
      saved_path: 'Mnemosyne/A talk.md',
      source_document: { kind: 'video', ...transcript },
    } )

    insertJob( job )

    expect( findJobById( job.id ) ).toEqual( job )
  } )

  it( 'stores a null source document when an update sets it to null', () => {
    const job = buildJob( { source_document: { kind: 'video', ...transcript } } )
    insertJob( job )

    const updated = updateJob( job.id, { source_document: null } )

    expect( updated?.source_document ).toBeNull()
    expect( findJobById( job.id )?.source_document ).toBeNull()
  } )

  it( 'throws when a stored transcript no longer matches the schema', () => {
    const directory = mkdtempSync( join( tmpdir(), 'mnemosyne-store-' ) )
    const path = join( directory, 'mnemosyne.db' )

    try {
      openDatabase( path )
      const job = buildJob()
      insertJob( job )
      const raw = new Database( path )
      raw.prepare( 'UPDATE jobs SET source_document = ? WHERE id = ?' ).run( '{"nope":1}', job.id )
      raw.close()

      expect( () => findJobById( job.id ) ).toThrow()
    } finally {
      closeDatabase()
      rmSync( directory, { recursive: true, force: true } )
    }
  } )

  it( 'throws a clear error when the store is not open', () => {
    closeDatabase()

    expect( () => findJobById( crypto.randomUUID() ) ).toThrow( 'Database is not open' )
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
    const ids = new Map( statuses.map( ( status ) => {
      const job = buildJob( { status } )
      insertJob( job )

      return [ status, job.id ] as const
    } ) )

    const count = markInterruptedJobs( 'Interrupted by restart', '2026-10-15T09:00:00.000Z' )

    expect( count ).toBe( 3 )

    for( const status of statuses ) {
      const job = findJobById( ids.get( status ) ?? '' )

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

  it( 'returns 0 when nothing was interrupted', () => {
    insertJob( buildJob() )

    expect( markInterruptedJobs( 'x', '2026-10-15T09:00:00.000Z' ) ).toBe( 0 )
  } )
} )

describe( 'listActiveJobs', () => {
  const active = [
    'queued',
    'downloading',
    'converting',
    'transcribing',
    'summarizing',
    'ready_for_review',
    'summary_failed',
  ] as const

  it( 'returns in-progress, review and failed-summary jobs only', () => {
    const inactive = [ 'failed', 'saved' ] as const

    for( const status of [ ...active, ...inactive ] ) {
      insertJob( buildJob( { status } ) )
    }

    const statuses = listActiveJobs().map( ( { status } ) => status )

    expect( statuses.toSorted() ).toEqual( [ ...active ].toSorted() )
  } )

  it( 'returns newest first, breaking ties by insertion order', () => {
    const old = buildJob( { created_at: '2026-10-14T10:00:00.000Z' } )
    const newer = buildJob( { created_at: '2026-10-15T10:00:00.000Z' } )
    const tieFirst = buildJob( { created_at: '2026-10-16T10:00:00.000Z' } )
    const tieSecond = buildJob( { created_at: '2026-10-16T10:00:00.000Z' } )
    for( const job of [ old, newer, tieFirst, tieSecond ] ) {
      insertJob( job )
    }

    expect( listActiveJobs().map( ( { id } ) => id ) ).toEqual( [
      tieSecond.id,
      tieFirst.id,
      newer.id,
      old.id,
    ] )
  } )

  it( 'returns an empty list for an empty store', () => {
    expect( listActiveJobs() ).toEqual( [] )
  } )
} )

describe( 'deleteJob', () => {
  it( 'removes the job and reports it', () => {
    const job = buildJob()
    insertJob( job )

    expect( deleteJob( job.id ) ).toBe( true )
    expect( findJobById( job.id ) ).toBeUndefined()
  } )

  it( 'removes the job\'s link runs and suggestions, and only its own', () => {
    const job = buildJob()
    const other = buildJob()
    const linker = findProfileBySeedKey( 'linker' )
    const version = findLatestVersion( linker?.id ?? '' )
    const run = ( jobId: string ): number => insertLinkRun( {
      job_id: jobId,
      model: 'claude-haiku-5-5',
      prompt_version_id: version?.id ?? 0,
      input_tokens: null,
      output_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      tool_calls: null,
      cost_usd: null,
      outcome: 'succeeded',
      error: null,
      created_at: '2026-10-21T10:00:00.000Z',
    } )
    const suggestion = [ {
      target: 'Pricing',
      kind: 'new_concept' as const,
      anchor: null,
      reason: 'Because.',
    } ]
    insertJob( job )
    insertJob( other )
    insertSuggestions( run( job.id ), job.id, suggestion )
    insertSuggestions( run( other.id ), other.id, suggestion )

    deleteJob( job.id )

    expect( listLinkRuns( job.id ) ).toEqual( [] )
    expect( listSuggestions( job.id ) ).toEqual( [] )
    expect( listLinkRuns( other.id ) ).toHaveLength( 1 )
    expect( listSuggestions( other.id ) ).toHaveLength( 1 )
  } )

  it( 'returns false for an unknown id and leaves other jobs alone', () => {
    const other = buildJob()
    insertJob( other )

    expect( deleteJob( 'missing' ) ).toBe( false )
    expect( findJobById( other.id ) ).toEqual( other )
  } )
} )

describe( 'findExpiredJobs', () => {
  const now = '2026-10-15T12:00:00.000Z'

  it( 'returns review and failed-summary jobs whose expiry has passed', () => {
    const review = buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T11:59:59.000Z',
    } )
    const failed = buildJob( { status: 'summary_failed', expires_at: now } )
    insertJob( review )
    insertJob( failed )

    expect( findExpiredJobs( now ).map( ( { id } ) => id ).toSorted() ).toEqual(
      [ review.id, failed.id ].toSorted(),
    )
  } )

  it( 'ignores unexpired jobs, null expiry and other statuses', () => {
    insertJob( buildJob( {
      status: 'ready_for_review',
      expires_at: '2026-10-15T12:00:01.000Z',
    } ) )
    insertJob( buildJob( { status: 'ready_for_review', expires_at: null } ) )
    insertJob( buildJob( { status: 'saved', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( buildJob( { status: 'failed', expires_at: '2026-10-01T00:00:00.000Z' } ) )
    insertJob( buildJob( { status: 'summarizing', expires_at: '2026-10-01T00:00:00.000Z' } ) )

    expect( findExpiredJobs( now ) ).toEqual( [] )
  } )
} )

describe( 'migration 3 on the final table', () => {
  it( 'lets jobs be inserted, updated and read on the final table', () => {
    openDatabase( ':memory:' )
    const job = buildJob( { note_markdown: 'note', target_folder: 'A' } )

    insertJob( job )
    updateJob( job.id, { status: 'ready_for_review', note_markdown: 'edited' } )

    expect( findJobById( job.id ) ).toMatchObject( {
      status: 'ready_for_review',
      note_markdown: 'edited',
      target_folder: 'A',
    } )
  } )
} )
