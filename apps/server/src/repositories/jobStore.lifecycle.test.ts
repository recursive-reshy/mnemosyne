// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { JobStatus } from '@mnemosyne/shared'
// Lifecycle
import { statusesWhere } from '../jobs/lifecycle.js'
// Repositories
import {
  StoredJob,
  clearJobs,
  findExpiredJobs,
  findJobById,
  findNextRunnableJob,
  insertJob,
  listActiveJobs,
  markInterruptedJobs,
  markInterruptedLinkingJobs,
} from './jobStore.repository.js'

// The status lists come from the lifecycle table (ADR 0048). Here the table is replaced by one
// that names only `saved`, so any list still written out in SQL would give a different answer.

vi.mock( '../jobs/lifecycle.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../jobs/lifecycle.js' ) >()

  return { ...original, statusesWhere: vi.fn( original.statusesWhere ) }
} )

const statusesWhereMock = vi.mocked( statusesWhere )
const original = statusesWhereMock.getMockImplementation()!

const buildJob = ( status: JobStatus, overrides: Partial< StoredJob > = {} ): StoredJob => {
  return {
    id: crypto.randomUUID(),
    url: 'https://www.youtube.com/watch?v=abc',
    status,
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

const onlySaved = (): void => {
  statusesWhereMock.mockImplementation( () => [ 'saved' ] )
}

beforeEach( () => {
  clearJobs()
  statusesWhereMock.mockReset()
  statusesWhereMock.mockImplementation( original )
} )

describe( 'status lists built from the lifecycle table', () => {
  it( 'findNextRunnableJob uses the runnable states', () => {
    const queued = buildJob( 'queued' )
    const saved = buildJob( 'saved' )
    insertJob( queued )
    insertJob( saved )

    expect( findNextRunnableJob()?.id ).toBe( queued.id )

    onlySaved()

    expect( findNextRunnableJob()?.id ).toBe( saved.id )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'runnable' )
  } )

  it( 'listActiveJobs uses the active states', () => {
    insertJob( buildJob( 'queued' ) )
    const saved = buildJob( 'saved' )
    insertJob( saved )

    onlySaved()

    expect( listActiveJobs().map( ( job ) => job.id ) ).toEqual( [ saved.id ] )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'active' )
  } )

  it( 'findExpiredJobs uses the expiring states', () => {
    const past = '2026-10-13T00:00:00.000Z'
    insertJob( buildJob( 'ready_for_review', { expires_at: past } ) )
    const saved = buildJob( 'saved', { expires_at: past } )
    insertJob( saved )

    onlySaved()

    expect( findExpiredJobs( '2026-10-14T10:00:00.000Z' ).map( ( job ) => job.id ) )
      .toEqual( [ saved.id ] )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'expires' )
  } )

  it( 'markInterruptedJobs uses the states that fail on restart', () => {
    const downloading = buildJob( 'downloading' )
    const saved = buildJob( 'saved' )
    insertJob( downloading )
    insertJob( saved )

    onlySaved()

    expect( markInterruptedJobs( 'Interrupted', '2026-10-14T11:00:00.000Z' ) ).toBe( 1 )
    expect( findJobById( saved.id )?.status ).toBe( 'failed' )
    expect( findJobById( downloading.id )?.status ).toBe( 'downloading' )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'onRestart', 'failed' )
  } )

  it( 'markInterruptedLinkingJobs uses the states that go to review on restart', () => {
    const linking = buildJob( 'linking', { link_state: 'pending' } )
    const saved = buildJob( 'saved' )
    insertJob( linking )
    insertJob( saved )

    onlySaved()

    expect( markInterruptedLinkingJobs(
      'Interrupted',
      '2026-10-14T11:00:00.000Z',
      '2026-10-15T11:00:00.000Z',
    ) ).toBe( 1 )
    expect( findJobById( saved.id ) ).toMatchObject( {
      status: 'ready_for_review',
      link_state: 'failed',
    } )
    expect( findJobById( linking.id )?.status ).toBe( 'linking' )
    expect( statusesWhereMock ).toHaveBeenCalledWith( 'onRestart', 'ready_for_review' )
  } )
} )
