// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { Transcript, parseNote } from '@mnemosyne/shared'
// Services
import {
  completeTranscription,
  findJob,
  markStatus,
  queueJob,
  retrySummary,
} from '../services/jobs.service.js'
// Repositories
import { clearJobs } from '../repositories/jobStore.repository.js'
// Clients
import { summarizeTranscript } from '../clients/claude.client.js'
// Worker
import { summarizeJob } from './summarizeJob.js'

vi.mock( '../clients/claude.client.js' )

const summarizeMock = vi.mocked( summarizeTranscript )

const transcript: Transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc123',
    channel: 'Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [
    { start: 0, end: 5, text: 'Rust has an ownership model.' },
    { start: 5, end: 10, text: 'Memory safety comes free.' },
  ],
}

const queueSummarizing = (): string => {
  const { id } = queueJob( transcript.meta.source )
  markStatus( id, 'downloading' )
  markStatus( id, 'converting' )
  markStatus( id, 'transcribing' )
  completeTranscription( id, transcript )

  return id
}

beforeEach( () => {
  clearJobs()
  vi.resetAllMocks()
  summarizeMock.mockResolvedValue( {
    overview: 'An overview.',
    key_points: [ { text: 'Ownership', seconds: 2 }, { text: 'Too late', seconds: 999 } ],
    quotes: [
      { text: 'Memory safety comes free.', seconds: 5 },
      { text: 'Invented quote', seconds: 6 },
    ],
    tags: [ 'Rust Lang', 'mnemosyne' ],
  } )
} )

describe( 'summarizeJob', () => {
  it( 'sends the stored transcript to the client', async () => {
    const id = queueSummarizing()

    await summarizeJob( id )

    expect( summarizeMock ).toHaveBeenCalledWith( { transcript } )
  } )

  it( 'stores the cleaned, rendered summary and moves to ready_for_review', async () => {
    const id = queueSummarizing()

    await summarizeJob( id )

    const job = findJob( id )
    const note = parseNote( job.note_markdown ?? '' )

    expect( job.status ).toBe( 'ready_for_review' )
    expect( note.properties.tags ).toEqual( [ 'mnemosyne', 'rust-lang' ] )
    expect( note.body ).toBe( [
      '## Summary',
      '',
      'An overview.',
      '',
      '## Key points',
      '',
      '- Ownership ([00:02](https://youtu.be/abc123?t=2))',
      '',
      '## Notable quotes',
      '',
      '> "Memory safety comes free." ([00:05](https://youtu.be/abc123?t=5))',
      '',
    ].join( '\n' ) )
  } )

  it.each( [
    [ new Error( 'Rate limited' ), 'Rate limited' ],
    [ 'nope', 'Unknown error' ],
  ] )( 'marks the summary failed when the client rejects', async ( reason, message ) => {
    const id = queueSummarizing()
    summarizeMock.mockRejectedValue( reason )

    await expect( summarizeJob( id ) ).resolves.toBeUndefined()

    expect( findJob( id ) ).toMatchObject( { status: 'summary_failed', error: message } )
  } )

  it( 'completes after a failed summary is retried', async () => {
    const id = queueSummarizing()
    summarizeMock.mockRejectedValueOnce( new Error( 'Rate limited' ) )
    await summarizeJob( id )
    expect( findJob( id ).status ).toBe( 'summary_failed' )

    retrySummary( id )
    await summarizeJob( id )

    expect( findJob( id ) ).toMatchObject( { status: 'ready_for_review', error: null } )
  } )
} )
