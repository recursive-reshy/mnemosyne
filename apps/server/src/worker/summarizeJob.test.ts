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
import { clearJobs, updateJob } from '../repositories/jobStore.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Prompts
import { listProfiles, saveVersion } from '../services/prompts.service.js'
// Clients
import { SummaryError, summarizeTranscript } from '../clients/claude.client.js'
// Worker
import { summarizeJob } from './summarizeJob.js'

vi.mock( '../clients/claude.client.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../clients/claude.client.js' ) >()

  return { ...original, summarizeTranscript: vi.fn() }
} )

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
    summary: {
      overview: 'An overview.',
      key_points: [ { text: 'Ownership', seconds: 2 }, { text: 'Too late', seconds: 999 } ],
      quotes: [
        { text: 'Memory safety comes free.', seconds: 5 },
        { text: 'Invented quote', seconds: 6 },
      ],
      tags: [ 'Rust Lang', 'mnemosyne' ],
    },
    usage: { input_tokens: 100, output_tokens: 20 },
  } )
} )

describe( 'summarizeJob', () => {
  it( 'sends the stored transcript to the client', async () => {
    const id = queueSummarizing()

    await summarizeJob( id )

    expect( summarizeMock ).toHaveBeenCalledWith( {
      transcript,
      model: 'claude-sonnet-5-5',
      guidance: expect.any( String ) as string,
    } )
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

  it( 'uses the default model and the default profile\'s current guidance', async () => {
    const id = queueSummarizing()
    saveVersion( listProfiles()[ 0 ]?.id ?? '', 'Be brief.' )
    setSetting( 'default_model', 'claude-opus-5-5' )

    await summarizeJob( id )

    expect( summarizeMock ).toHaveBeenCalledWith( {
      transcript,
      model: 'claude-opus-5-5',
      guidance: 'Be brief.',
    } )
  } )

  it( 'uses the model and profile stored on the job', async () => {
    const id = queueSummarizing()
    const coding = listProfiles().find( ( { name } ) => name === 'Coding' )
    updateJob( id, { summary_model: 'claude-sonnet-4-6', prompt_profile_id: coding?.id ?? null } )

    await summarizeJob( id )

    expect( summarizeMock ).toHaveBeenCalledWith( {
      transcript,
      model: 'claude-sonnet-4-6',
      guidance: coding?.current_version.guidance,
    } )
  } )

  it( 'records a succeeded run with tokens and cost', async () => {
    const id = queueSummarizing()

    await summarizeJob( id )

    expect( findJob( id ).summary_usage ).toMatchObject( {
      last_run: {
        model: 'claude-sonnet-5-5',
        profile_name: 'Business ideas',
        prompt_version: 1,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd: ( 100 * 2 + 20 * 10 ) / 1_000_000,
        outcome: 'succeeded',
      },
      run_count: 1,
    } )
  } )

  it( 'records a failed run with the tokens of an unusable response', async () => {
    const id = queueSummarizing()
    const usage = { input_tokens: 500, output_tokens: 16_000 }
    summarizeMock.mockRejectedValue( new SummaryError( 'Summary was cut off', { usage } ) )

    await summarizeJob( id )

    expect( findJob( id ) )
      .toMatchObject( { status: 'summary_failed', error: 'Summary was cut off' } )
    expect( findJob( id ).summary_usage?.last_run ).toMatchObject( {
      outcome: 'failed',
      input_tokens: 500,
      output_tokens: 16_000,
    } )
  } )

  it( 'records a failed run without tokens when the request itself failed', async () => {
    const id = queueSummarizing()
    summarizeMock.mockRejectedValue( new SummaryError( 'Summary request failed: Overloaded' ) )

    await summarizeJob( id )

    expect( findJob( id ).summary_usage?.last_run ).toMatchObject( {
      outcome: 'failed',
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } )
  } )

  it( 'records a run for every attempt', async () => {
    const id = queueSummarizing()
    summarizeMock.mockRejectedValueOnce( new Error( 'Rate limited' ) )
    await summarizeJob( id )
    retrySummary( id )

    await summarizeJob( id )

    expect( findJob( id ).summary_usage ).toMatchObject( {
      run_count: 2,
      last_run: { outcome: 'succeeded' },
    } )
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
