// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { JobStatus, Transcript } from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import { clearJobs, findJobById, updateJob } from '../repositories/jobStore.repository.js'
// Services
import {
  completeSummary,
  completeAcquisition,
  deleteExpiredJobs,
  discardJob,
  failJob,
  failSummary,
  findJob,
  findSource,
  findNextRunnableJob,
  getSource,
  listJobs,
  markStatus,
  queueJob,
  recordSummaryRun,
  recoverInterruptedJobs,
  regenerateSummary,
  renderTranscript,
  retrySummary,
  saveJob,
  updateDraft,
} from './jobs.service.js'
// Models
import { assertKnownModel } from './models.service.js'
// Prompts
import {
  createProfile,
  deleteProfile,
  listProfiles,
  resolvePrompt,
  saveVersion,
} from './prompts.service.js'
// Clients
import { writeNote } from '../clients/vault.client.js'
// Formatters
import { formatNote } from '../formatters/note.formatter.js'
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatSrt } from '../formatters/srt.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

vi.mock( '../clients/vault.client.js' )
vi.mock( './models.service.js' )

const writeNoteMock = vi.mocked( writeNote )
const assertKnownModelMock = vi.mocked( assertKnownModel )

const url = 'https://www.youtube.com/watch?v=abc'
const startTime = new Date( '2026-10-14T10:00:00.000Z' )
const laterTime = new Date( '2026-10-14T10:05:00.000Z' )

const transcript: Transcript = {
  meta: {
    title: 'A talk',
    source: url,
    channel: 'Some Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-14T10:04:00.000Z',
    model: 'large-v3',
  },
  segments: [ { start: 0, end: 1, text: 'Hello' } ],
}

const queueJobAt = async ( status: JobStatus ): Promise< string > => {
  const { id } = await queueJob( url )
  const path: JobStatus[] = [ 'downloading', 'converting', 'transcribing' ]

  for( const step of path ) {
    if( status === 'queued' ) break
    markStatus( id, step as 'downloading' | 'converting' | 'transcribing' )
    if( step === status ) break
  }
  if( status === 'ready_for_review' || status === 'summary_failed' ) {
    completeAcquisition( id, { kind: 'video', ...transcript } )

    if( status === 'ready_for_review' ) {
      completeSummary( id, '## Summary', [] )
    } else {
      failSummary( id, 'earlier summary failure' )
    }
  }
  if( status === 'failed' ) failJob( id, 'earlier failure' )

  return id
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( startTime )
  clearJobs()
  writeNoteMock.mockReset()
  writeNoteMock.mockResolvedValue( 'Mnemosyne/Edited title.md' )
  assertKnownModelMock.mockReset()
  assertKnownModelMock.mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'queueJob', () => {
  it( 'returns a queued public job', async () => {
    const job = await queueJob( url )

    expect( job ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      url,
      status: 'queued',
      error: null,
      created_at: startTime.toISOString(),
      updated_at: startTime.toISOString(),
      title: null,
      note_markdown: null,
      target_folder: null,
      expires_at: null,
      saved_path: null,
      summary_model: null,
      prompt_profile_id: null,
      summary_usage: null,
      source_type: 'video',
      feed_id: null,
      feed_name: null,
    } )
  } )

  it( 'does not expose a transcript property', async () => {
    expect( await queueJob( url ) ).not.toHaveProperty( 'transcript' )
  } )

  it( 'produces a different id on each call', async () => {
    expect( ( await queueJob( url ) ).id ).not.toBe( ( await queueJob( url ) ).id )
  } )
} )

describe( 'findJob', () => {
  it( 'returns the public job', async () => {
    const { id } = await queueJob( url )

    const job = findJob( id )

    expect( job.id ).toBe( id )
    expect( job ).not.toHaveProperty( 'transcript' )
  } )

  it( 'returns the stored fields of a job', async () => {
    const { id } = await queueJob( url )
    updateJob( id, {
      title: 'A talk',
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )

    expect( findJob( id ) ).toMatchObject( {
      title: 'A talk',
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => findJob( 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'markStatus', () => {
  it( 'walks queued to transcribing', async () => {
    const { id } = await queueJob( url )

    expect( markStatus( id, 'downloading' ).status ).toBe( 'downloading' )
    expect( markStatus( id, 'converting' ).status ).toBe( 'converting' )
    expect( markStatus( id, 'transcribing' ).status ).toBe( 'transcribing' )
  } )

  it( 'updates updated_at and keeps created_at', async () => {
    const { id } = await queueJob( url )
    vi.setSystemTime( laterTime )

    const job = markStatus( id, 'downloading' )

    expect( job.updated_at ).toBe( laterTime.toISOString() )
    expect( job.created_at ).toBe( startTime.toISOString() )
  } )

  it( 'throws ConflictError when skipping a step', async () => {
    const { id } = await queueJob( url )

    expect( () => markStatus( id, 'converting' ) ).toThrow( ConflictError )
    expect( () => markStatus( id, 'converting' ) ).toThrow(
      'Cannot move job from queued to converting',
    )
  } )

  it( 'throws ConflictError when moving backwards', async () => {
    const id = await queueJobAt( 'converting' )

    expect( () => markStatus( id, 'downloading' ) ).toThrow( ConflictError )
  } )

  it( 'throws ConflictError from a final status', async () => {
    const id = await queueJobAt( 'failed' )

    expect( () => markStatus( id, 'downloading' ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => markStatus( 'missing', 'downloading' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'failJob', () => {
  it.each( [ 'queued', 'downloading', 'converting', 'transcribing' ] as const )(
    'fails a job from %s with the message',
    async ( status ) => {
      const id = await queueJobAt( status )

      const job = failJob( id, 'yt-dlp exited with 1' )

      expect( job.status ).toBe( 'failed' )
      expect( job.error ).toBe( 'yt-dlp exited with 1' )
    },
  )

  it.each( [ 'failed' ] as const )( 'throws ConflictError from %s', async ( status ) => {
    const id = await queueJobAt( status )

    expect( () => failJob( id, 'late' ) ).toThrow( ConflictError )
  } )
} )

describe( 'renderTranscript', () => {
  const queueReviewJob = async (
    outcome: 'ready_for_review' | 'summary_failed',
  ): Promise< string > => {
    const { id } = await queueJob( url )

    markStatus( id, 'downloading' )
    markStatus( id, 'converting' )
    markStatus( id, 'transcribing' )
    completeAcquisition( id, { kind: 'video', ...transcriptFixture } )

    if( outcome === 'ready_for_review' ) {
      completeSummary( id, '## Summary', [] )
    } else {
      failSummary( id, 'Rate limited' )
    }

    return id
  }

  it.each( [
    [ 'md', 'Video title.md', 'text/markdown; charset=utf-8', formatMarkdown ],
    [ 'srt', 'Video title.srt', 'application/x-subrip; charset=utf-8', formatSrt ],
    [ 'txt', 'Video title.txt', 'text/plain; charset=utf-8', formatTxt ],
  ] as const )(
    'renders a review job as %s',
    async ( format, filename, contentType, formatter ) => {
      const id = await queueReviewJob( 'ready_for_review' )

      const rendered = renderTranscript( id, format )

      expect( rendered ).toEqual( {
        filename,
        contentType,
        body: formatter( transcriptFixture ),
      } )
    },
  )

  it( 'still renders after the summary failed', async () => {
    const id = await queueReviewJob( 'summary_failed' )

    expect( renderTranscript( id, 'md' ).body ).toBe( formatMarkdown( transcriptFixture ) )
  } )

  it( 'throws ConflictError once the job is saved', async () => {
    const id = await queueReviewJob( 'ready_for_review' )
    updateJob( id, { status: 'saved', source_document: null } )

    expect( () => renderTranscript( id, 'md' ) ).toThrow(
      new ConflictError( 'Transcript not ready' ),
    )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => renderTranscript( 'missing', 'md' ) ).toThrow( NotFoundError )
  } )

  it.each( [
    'queued',
    'downloading',
    'converting',
    'transcribing',
    'summarizing',
    'failed',
  ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = status === 'summarizing' ? await queueSummarizing() : await queueJobAt( status )

      expect( () => renderTranscript( id, 'md' ) ).toThrow(
        new ConflictError( 'Transcript not ready' ),
      )
    },
  )
} )

describe( 'findNextRunnableJob', () => {
  it( 'returns a summarizing job so it can be resumed', async () => {
    const id = await queueSummarizing()

    expect( findNextRunnableJob()?.id ).toBe( id )
  } )

  it( 'returns undefined when no jobs exist', () => {
    expect( findNextRunnableJob() ).toBeUndefined()
  } )

  it( 'returns the oldest queued job', async () => {
    const first = await queueJob( 'https://example.com/a' )
    await queueJob( 'https://example.com/b' )

    expect( findNextRunnableJob() ).toEqual( first )
  } )

  it( 'skips jobs that are no longer queued', async () => {
    const first = await queueJob( 'https://example.com/a' )
    const second = await queueJob( 'https://example.com/b' )
    markStatus( first.id, 'downloading' )

    expect( findNextRunnableJob() ).toEqual( second )
  } )

  it( 'returns undefined when every job has moved on', async () => {
    const first = await queueJob( 'https://example.com/a' )
    const second = await queueJob( 'https://example.com/b' )
    markStatus( first.id, 'downloading' )
    markStatus( second.id, 'downloading' )

    expect( findNextRunnableJob() ).toBeUndefined()
  } )

  it( 'returns a job without a transcript field', async () => {
    await queueJob( 'https://example.com/a' )

    expect( findNextRunnableJob() ).not.toHaveProperty( 'transcript' )
  } )
} )

describe( 'recoverInterruptedJobs', () => {
  it( 'fails jobs left mid-processing and returns how many', async () => {
    const queued = await queueJobAt( 'queued' )
    const downloading = await queueJobAt( 'downloading' )
    const transcribing = await queueJobAt( 'transcribing' )
    const finished = await queueJobAt( 'ready_for_review' )
    vi.setSystemTime( laterTime )

    expect( recoverInterruptedJobs() ).toBe( 2 )

    expect( findJob( downloading ) ).toMatchObject( {
      status: 'failed',
      error: 'Interrupted by restart',
      updated_at: laterTime.toISOString(),
    } )
    expect( findJob( transcribing ).status ).toBe( 'failed' )
    expect( findJob( queued ).status ).toBe( 'queued' )
    expect( findJob( finished ).status ).toBe( 'ready_for_review' )
  } )

  it( 'returns 0 when nothing needs recovery', () => {
    expect( recoverInterruptedJobs() ).toBe( 0 )
  } )
} )

const queueSummarizing = async (): Promise< string > => {
  const id = await queueJobAt( 'transcribing' )
  completeAcquisition( id, { kind: 'video', ...transcript } )

  return id
}

describe( 'completeAcquisition', () => {
  it( 'moves a transcribing job to summarizing and stores transcript and title', async () => {
    const id = await queueJobAt( 'transcribing' )

    const job = completeAcquisition( id, { kind: 'video', ...transcript } )

    expect( job.status ).toBe( 'summarizing' )
    expect( job.title ).toBe( 'A talk' )
    expect( job ).not.toHaveProperty( 'transcript' )
    expect( findJobById( id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it.each( [ 'queued', 'downloading', 'converting', 'failed' ] as const )(
    'throws ConflictError from %s and changes nothing',
    async ( status ) => {
      const id = await queueJobAt( status )
      const before = findJobById( id )

      expect( () => completeAcquisition( id, { kind: 'video', ...transcript } ) )
        .toThrow( ConflictError )
      expect( findJobById( id ) ).toEqual( before )
    },
  )
} )

describe( 'completeSummary', () => {
  it( 'stores the note and sets the expiry from the review TTL', async () => {
    const id = await queueSummarizing()

    const job = completeSummary( id, '## Summary\nText', [ 'rust' ] )

    expect( job ).toMatchObject( {
      status: 'ready_for_review',
      error: null,
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
  } )

  it( 'stores the whole note: properties from the transcript, today as created', async () => {
    const id = await queueSummarizing()

    const job = completeSummary( id, '## Summary\nText\n\n', [ 'Rust', 'mnemosyne' ] )

    expect( job.note_markdown ).toBe( formatNote( {
      title: transcript.meta.title,
      tags: [ 'rust' ],
      body: '## Summary\nText',
      meta: transcript.meta,
      created: '2026-10-14',
    } ) )
    expect( job.target_folder ).toBeNull()
  } )

  it.each( [ 'queued', 'transcribing', 'failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => completeSummary( id, 'x', [] ) ).toThrow( ConflictError )
    },
  )

  it( 'throws ConflictError when called twice', async () => {
    const id = await queueSummarizing()
    completeSummary( id, 'x', [] )

    expect( () => completeSummary( id, 'y', [] ) ).toThrow( ConflictError )
  } )
} )

describe( 'failSummary', () => {
  it( 'moves a summarizing job to summary_failed with the error and an expiry', async () => {
    const id = await queueSummarizing()

    const job = failSummary( id, 'Rate limited' )

    expect( job ).toMatchObject( {
      status: 'summary_failed',
      error: 'Rate limited',
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
    expect( findJobById( id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'throws ConflictError from a non-summarizing status', async () => {
    const id = await queueJobAt( 'transcribing' )

    expect( () => failSummary( id, 'x' ) ).toThrow( ConflictError )
  } )
} )

describe( 'failJob after the summary steps', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'refuses to fail a job in %s',
    async ( status ) => {
      const id = await queueSummarizing()

      if( status === 'ready_for_review' ) {
        completeSummary( id, 'x', [] )
      } else {
        failSummary( id, 'x' )
      }

      expect( () => failJob( id, 'late' ) ).toThrow( ConflictError )
      expect( findJob( id ).status ).toBe( status )
    },
  )

  it( 'refuses to fail a saved job', async () => {
    const id = await queueSummarizing()
    completeSummary( id, 'x', [] )
    updateJob( id, { status: 'saved' } )

    expect( () => failJob( id, 'late' ) ).toThrow( ConflictError )
  } )

  it( 'can still fail a summarizing job', async () => {
    const id = await queueSummarizing()

    expect( failJob( id, 'boom' ).status ).toBe( 'failed' )
  } )
} )

describe( 'getSource', () => {
  it( 'returns the stored transcript', async () => {
    const id = await queueSummarizing()

    expect( getSource( id ) ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'throws NotFoundError for an unknown job', () => {
    expect( () => getSource( 'missing' ) ).toThrow( NotFoundError )
  } )

  it( 'throws when the job has no transcript', async () => {
    const { id } = await queueJob( url )

    expect( () => getSource( id ) ).toThrow( 'has no transcript' )
  } )
} )

describe( 'listJobs', () => {
  it( 'returns public jobs, newest first', async () => {
    const first = await queueJob( url )
    vi.setSystemTime( laterTime )
    const second = await queueJob( url )

    const jobs = listJobs()

    expect( jobs.map( ( { id } ) => id ) ).toEqual( [ second.id, first.id ] )
    expect( jobs[ 0 ] ).not.toHaveProperty( 'transcript' )
  } )

  it( 'leaves out failed and saved jobs', async () => {
    const failed = await queueJobAt( 'failed' )
    const review = await queueJobAt( 'ready_for_review' )

    expect( listJobs().map( ( { id } ) => id ) ).toEqual( [ review ] )
    expect( listJobs().map( ( { id } ) => id ) ).not.toContain( failed )
  } )
} )

describe( 'findSource', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'returns the transcript when the job is %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( findSource( id ) ).toEqual( { kind: 'video', ...transcript } )
    },
  )

  it( 'throws ConflictError while summarizing', async () => {
    const id = await queueSummarizing()

    expect( () => findSource( id ) ).toThrow( new ConflictError( 'Transcript not ready' ) )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => findSource( 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'saveJob', () => {
  const draft = [
    '---',
    'title: "Edited title"',
    'source: "x"',
    'channel: "x"',
    'duration: "x"',
    'created: 2020-01-01',
    'tags: [rust, Big Idea]',
    '---',
    '',
    '## Summary',
    'Edited.',
    '',
  ].join( '\n' )

  const queueDrafted = async ( target_folder?: string ): Promise< string > => {
    const id = await queueJobAt( 'ready_for_review' )
    updateDraft( id, { note_markdown: draft, target_folder: target_folder ?? null } )

    return id
  }

  it( 'writes the stored draft, with locked properties and today as created', async () => {
    const id = await queueDrafted()

    await saveJob( id )

    expect( writeNoteMock ).toHaveBeenCalledExactlyOnceWith(
      expect.any( String ),
      'Mnemosyne',
      'Edited title',
      [
        '---',
        'title: "Edited title"',
        `source: "${ url }"`,
        'channel: "Some Channel"',
        'duration: "01:00"',
        'created: 2026-10-14',
        'tags: [mnemosyne, rust, big-idea]',
        '---',
        '',
        '## Summary',
        'Edited.',
        '',
      ].join( '\n' ),
    )
  } )

  it( 'writes to the chosen folder', async () => {
    const id = await queueDrafted( 'Learning/AI' )

    await saveJob( id )

    expect( writeNoteMock ).toHaveBeenCalledWith(
      expect.any( String ),
      'Learning/AI',
      'Edited title',
      expect.any( String ),
    )
  } )

  it( 'marks the job saved, keeps the title and note, and drops the transcript', async () => {
    const id = await queueDrafted()
    const note = findJobById( id )?.note_markdown

    const savedPath = await saveJob( id )

    expect( savedPath ).toBe( 'Mnemosyne/Edited title.md' )
    expect( findJob( id ) ).toMatchObject( {
      status: 'saved',
      saved_path: 'Mnemosyne/Edited title.md',
      title: 'Edited title',
      expires_at: null,
    } )
    expect( findJobById( id )?.source_document ).toBeNull()
    expect( findJobById( id )?.note_markdown ).toBe( note )
  } )

  it( 'uses the path the vault returns, collision suffix included', async () => {
    const id = await queueDrafted()
    writeNoteMock.mockResolvedValue( 'Mnemosyne/Edited title (2).md' )

    await expect( saveJob( id ) ).resolves.toBe( 'Mnemosyne/Edited title (2).md' )
  } )

  it( 'keeps the job in review when the folder is no longer valid', async () => {
    const id = await queueDrafted()
    updateJob( id, { target_folder: '../outside' } )
    writeNoteMock.mockRejectedValue( new ValidationError( 'outside the vault' ) )

    await expect( saveJob( id ) ).rejects.toThrow( ValidationError )

    expect( findJob( id ).status ).toBe( 'ready_for_review' )
  } )

  it( 'throws ConflictError when there is no draft', async () => {
    const id = await queueDrafted()
    updateJob( id, { note_markdown: null } )

    await expect( saveJob( id ) ).rejects.toThrow( ConflictError )
    expect( writeNoteMock ).not.toHaveBeenCalled()
  } )

  it( 'keeps the job in review with its transcript when the write fails', async () => {
    const id = await queueDrafted()
    writeNoteMock.mockRejectedValue( new Error( 'EACCES' ) )

    await expect( saveJob( id ) ).rejects.toThrow( 'EACCES' )

    expect( findJob( id ).status ).toBe( 'ready_for_review' )
    expect( findJobById( id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it.each( [ 'queued', 'transcribing', 'summary_failed', 'failed' ] as const )(
    'throws ConflictError from %s without writing',
    async ( status ) => {
      const id = await queueJobAt( status )

      await expect( saveJob( id ) ).rejects.toThrow( ConflictError )
      expect( writeNoteMock ).not.toHaveBeenCalled()
    },
  )

  it( 'throws ConflictError when saved twice', async () => {
    const id = await queueDrafted()
    await saveJob( id )

    await expect( saveJob( id ) ).rejects.toThrow( ConflictError )
    expect( writeNoteMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'throws NotFoundError for an unknown id', async () => {
    await expect( saveJob( 'missing' ) ).rejects.toThrow( NotFoundError )
  } )
} )

describe( 'retrySummary', () => {
  it( 'moves a failed summary back to summarizing, clearing error and expiry', async () => {
    const id = await queueJobAt( 'summary_failed' )

    const job = retrySummary( id )

    expect( job ).toMatchObject( { status: 'summarizing', error: null, expires_at: null } )
    expect( findJobById( id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'makes the job runnable again', async () => {
    const id = await queueJobAt( 'summary_failed' )

    retrySummary( id )

    expect( findNextRunnableJob()?.id ).toBe( id )
  } )

  it.each( [ 'queued', 'transcribing', 'ready_for_review', 'failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => retrySummary( id ) ).toThrow( ConflictError )
    },
  )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => retrySummary( 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'discardJob', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'deletes a job that is %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      discardJob( id )

      expect( findJobById( id ) ).toBeUndefined()
      expect( () => findJob( id ) ).toThrow( NotFoundError )
    },
  )

  it.each( [ 'queued', 'transcribing', 'failed' ] as const )(
    'throws ConflictError from %s and keeps the job',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => discardJob( id ) ).toThrow( ConflictError )
      expect( findJob( id ).status ).toBe( status )
    },
  )

  it( 'throws ConflictError for a summarizing job', async () => {
    const id = await queueSummarizing()

    expect( () => discardJob( id ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => discardJob( 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'deleteExpiredJobs', () => {
  it( 'deletes jobs past their expiry and returns how many', async () => {
    const expiredReview = await queueJobAt( 'ready_for_review' )
    const expiredFailed = await queueJobAt( 'summary_failed' )
    const fresh = await queueJobAt( 'ready_for_review' )
    updateJob( expiredReview, { expires_at: '2026-10-14T09:00:00.000Z' } )
    updateJob( expiredFailed, { expires_at: '2026-10-14T09:59:59.000Z' } )
    updateJob( fresh, { expires_at: '2026-10-14T10:00:01.000Z' } )

    expect( deleteExpiredJobs() ).toBe( 2 )

    expect( findJobById( expiredReview ) ).toBeUndefined()
    expect( findJobById( expiredFailed ) ).toBeUndefined()
    expect( findJob( fresh ).status ).toBe( 'ready_for_review' )
  } )

  it( 'returns 0 when nothing has expired', async () => {
    await queueJobAt( 'ready_for_review' )

    expect( deleteExpiredJobs() ).toBe( 0 )
  } )
} )

describe( 'updateDraft', () => {
  const queueReview = async (): Promise< string > => {
    const id = await queueSummarizing()
    completeSummary( id, '## Summary\nText', [ 'rust' ] )

    return id
  }

  const draft = ( overrides: Record< string, string > = {} ): string => {
    const properties = {
      title: 'My title',
      source: 'https://wrong.example',
      channel: 'Wrong',
      duration: '9:99',
      created: '1999-01-01',
      ...overrides,
    }

    return [
      '---',
      `title: "${ properties.title }"`,
      `source: "${ properties.source }"`,
      `channel: "${ properties.channel }"`,
      `duration: "${ properties.duration }"`,
      `created: ${ properties.created }`,
      'tags: [rust, Big Idea]',
      '---',
      '',
      '## Edited',
      '',
    ].join( '\n' )
  }

  it( 'stores the note with locked properties re-applied and syncs the title', async () => {
    const id = await queueReview()

    const job = updateDraft( id, { note_markdown: draft() } )

    expect( job.title ).toBe( 'My title' )
    expect( job.note_markdown ).toBe( [
      '---',
      'title: "My title"',
      `source: "${ url }"`,
      'channel: "Some Channel"',
      'duration: "01:00"',
      'created: 2026-10-14',
      'tags: [mnemosyne, rust, big-idea]',
      '---',
      '',
      '## Edited',
      '',
    ].join( '\n' ) )
    expect( findJobById( id )?.note_markdown ).toBe( job.note_markdown )
  } )

  it.each( [ 'not a note', '---\ntitle: "A\ntags: [a\n---\n\nBody\n' ] )(
    'rejects %j with ValidationError and stores nothing',
    async ( note ) => {
      const id = await queueReview()
      const before = findJobById( id )

      expect( () => updateDraft( id, { note_markdown: note } ) ).toThrow( ValidationError )
      expect( () => updateDraft( id, { note_markdown: note } ) ).toThrow( /front-matter invalid/ )
      expect( findJobById( id ) ).toEqual( before )
    },
  )

  it( 'sets and clears the target folder without requiring it to exist', async () => {
    const id = await queueReview()

    expect( updateDraft( id, { target_folder: 'New/Nested' } ).target_folder )
      .toBe( 'New/Nested' )
    expect( updateDraft( id, { target_folder: null } ).target_folder ).toBeNull()
  } )

  it.each( [ '../x', '/abs', 'a//b', '.hidden' ] )(
    'rejects the folder %j with ValidationError',
    async ( folder ) => {
      const id = await queueReview()

      expect( () => updateDraft( id, { target_folder: folder } ) ).toThrow( ValidationError )
      expect( findJobById( id )?.target_folder ).toBeNull()
    },
  )

  it( 'restarts the expiry and bumps updated_at, for a folder-only change too', async () => {
    const id = await queueReview()
    vi.setSystemTime( laterTime )

    const job = updateDraft( id, { target_folder: 'A' } )

    expect( job.expires_at ).toBe( new Date( laterTime.getTime() + 24 * 3_600_000 ).toISOString() )
    expect( job.updated_at ).toBe( laterTime.toISOString() )
  } )

  it( 'leaves the note alone when only the folder changes', async () => {
    const id = await queueReview()
    const before = findJobById( id )?.note_markdown

    expect( updateDraft( id, { target_folder: 'A' } ).note_markdown ).toBe( before )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => updateDraft( crypto.randomUUID(), { target_folder: 'A' } ) )
      .toThrow( NotFoundError )
  } )

  it.each( [ 'queued', 'transcribing', 'failed', 'summary_failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => updateDraft( id, { target_folder: 'A' } ) ).toThrow( ConflictError )
    },
  )
} )

describe( 'recordSummaryRun and summary_usage', () => {
  const version = (): number => resolvePrompt( null ).version.id

  it( 'has no usage before the first attempt', async () => {
    expect( findJob( await queueJobAt( 'queued' ) ).summary_usage ).toBeNull()
  } )

  it( 'records a succeeded run with tokens and the estimated cost', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1_000_000, output_tokens: 100_000 },
    } )

    expect( findJob( id ).summary_usage ).toEqual( {
      last_run: {
        model: 'claude-sonnet-5-5',
        profile_id: resolvePrompt( null ).profile.id,
        profile_name: 'Business ideas',
        prompt_version: 1,
        input_tokens: 1_000_000,
        output_tokens: 100_000,
        cost_usd: 3,
        outcome: 'succeeded',
        created_at: startTime.toISOString(),
      },
      run_count: 1,
      total_input_tokens: 1_000_000,
      total_output_tokens: 100_000,
      total_cost_usd: 3,
    } )
  } )

  it( 'records tokens but no cost for a model without a price', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( id, {
      model: 'claude-haiku-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 10, output_tokens: 5 },
    } )

    expect( findJob( id ).summary_usage ).toMatchObject( {
      last_run: { input_tokens: 10, output_tokens: 5, cost_usd: null },
      total_cost_usd: null,
    } )
  } )

  it( 'records a failed run with the billed tokens and the error', async () => {
    const id = await queueJobAt( 'summary_failed' )

    recordSummaryRun( id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
      error: 'Summary was cut off',
    } )

    expect( findJob( id ).summary_usage ).toMatchObject( {
      last_run: { outcome: 'failed', input_tokens: 1_000_000, cost_usd: 2 },
      total_cost_usd: 2,
    } )
  } )

  it( 'records a failed run without tokens or cost when no response came back', async () => {
    const id = await queueJobAt( 'summary_failed' )

    recordSummaryRun( id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: undefined,
      error: 'Summary request failed: Overloaded',
    } )

    expect( findJob( id ).summary_usage ).toEqual( expect.objectContaining( {
      last_run: expect.objectContaining( {
        outcome: 'failed',
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
      } ) as unknown,
      run_count: 1,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
    } ) )
  } )

  it( 'reports the latest run, the count and the totals over several runs', async () => {
    const id = await queueJobAt( 'ready_for_review' )
    const first = version()
    saveVersion( resolvePrompt( null ).profile.id, 'A newer prompt' )

    recordSummaryRun( id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: first,
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    } )
    recordSummaryRun( id, {
      model: 'claude-opus-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 500_000, output_tokens: 100_000 },
    } )

    expect( findJob( id ).summary_usage ).toMatchObject( {
      last_run: { model: 'claude-opus-5-5', prompt_version: 2, cost_usd: 4 },
      run_count: 2,
      total_input_tokens: 1_500_000,
      total_output_tokens: 100_000,
      total_cost_usd: 6,
    } )
  } )

  it( 'has no total cost when any run with tokens is unpriced', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1000, output_tokens: 10 },
    } )
    recordSummaryRun( id, {
      model: 'claude-haiku-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1000, output_tokens: 10 },
    } )

    expect( findJob( id ).summary_usage?.total_cost_usd ).toBeNull()
  } )

  it( 'keeps the profile name after the profile is deleted', async () => {
    const id = await queueJobAt( 'ready_for_review' )
    const { id: profileId } = createProfile( { name: 'Temporary', guidance: 'x' } )
    const versionId = resolvePrompt( profileId ).version.id

    recordSummaryRun( id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: versionId,
      usage: { input_tokens: 1, output_tokens: 1 },
    } )
    deleteProfile( profileId )

    expect( findJob( id ).summary_usage?.last_run ).toMatchObject( {
      profile_id: profileId,
      profile_name: 'Temporary',
    } )
  } )
} )

describe( 'queueJob options', () => {
  const codingId = (): string => listProfiles().find( ( { name } ) => name === 'Coding' )?.id ?? ''

  it( 'stores the model and profile when given', async () => {
    const profileId = codingId()

    const job = await queueJob( url, { model: 'claude-opus-5-5', profile_id: profileId } )

    expect( assertKnownModelMock ).toHaveBeenCalledWith( 'claude-opus-5-5' )
    expect( job )
      .toMatchObject( { summary_model: 'claude-opus-5-5', prompt_profile_id: profileId } )
    expect( findJobById( job.id ) ).toMatchObject( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: profileId,
    } )
  } )

  it( 'stores null for both when no options are given', async () => {
    const none = { summary_model: null, prompt_profile_id: null }

    expect( await queueJob( url ) ).toMatchObject( none )
    expect( await queueJob( url, {} ) ).toMatchObject( none )
    expect( assertKnownModelMock ).not.toHaveBeenCalled()
  } )

  it( 'rejects an unknown model and queues nothing', async () => {
    assertKnownModelMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( queueJob( url, { model: 'nope' } ) ).rejects.toThrow( 'Unknown model: nope' )
    expect( listJobs() ).toEqual( [] )
  } )

  it( 'rejects an unknown profile', async () => {
    await expect( queueJob( url, { profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
    expect( listJobs() ).toEqual( [] )
  } )

  it( 'rejects a deleted profile', async () => {
    const profileId = codingId()
    deleteProfile( profileId )

    await expect( queueJob( url, { profile_id: profileId } ) ).rejects.toThrow( ValidationError )
  } )
} )

describe( 'regenerateSummary', () => {
  const codingId = (): string => listProfiles().find( ( { name } ) => name === 'Coding' )?.id ?? ''

  const queueReviewed = async (): Promise< string > => {
    const id = await queueJobAt( 'ready_for_review' )
    const note_markdown = findJobById( id )?.note_markdown ?? ''
    updateDraft( id, { note_markdown, target_folder: 'Learning' } )

    return id
  }

  it( 'moves a job in review to summarizing and keeps the note and folder', async () => {
    const id = await queueReviewed()
    const before = findJobById( id )

    const job = await regenerateSummary( id, {} )

    expect( job ).toMatchObject( {
      status: 'summarizing',
      error: null,
      expires_at: null,
      target_folder: 'Learning',
      note_markdown: before?.note_markdown,
    } )
    expect( findJobById( id )?.source_document ).not.toBeNull()
  } )

  it( 'stores the new model and profile when given', async () => {
    const id = await queueReviewed()

    const job = await regenerateSummary( id, { model: 'claude-opus-5-5', profile_id: codingId() } )

    expect( assertKnownModelMock ).toHaveBeenCalledWith( 'claude-opus-5-5' )
    expect( job ).toMatchObject( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: codingId(),
    } )
  } )

  it( 'keeps the earlier choices when none are given', async () => {
    const profileId = codingId()
    const { id } = await queueJob( url, { model: 'claude-opus-5-5', profile_id: profileId } )
    markStatus( id, 'downloading' )
    markStatus( id, 'converting' )
    markStatus( id, 'transcribing' )
    completeAcquisition( id, { kind: 'video', ...transcript } )
    completeSummary( id, '## Summary', [] )

    const job = await regenerateSummary( id, {} )

    expect( job )
      .toMatchObject( { summary_model: 'claude-opus-5-5', prompt_profile_id: profileId } )
  } )

  it.each( [
    'queued',
    'downloading',
    'converting',
    'transcribing',
    'summary_failed',
    'failed',
  ] as const )( 'refuses a job that is %s', async ( status ) => {
    const id = await queueJobAt( status )

    await expect( regenerateSummary( id, {} ) ).rejects.toThrow( ConflictError )
    expect( findJob( id ).status ).toBe( status )
  } )

  it( 'refuses a job that is already summarizing', async () => {
    const id = await queueJobAt( 'transcribing' )
    completeAcquisition( id, { kind: 'video', ...transcript } )

    await expect( regenerateSummary( id, {} ) ).rejects.toThrow( ConflictError )
    expect( findJob( id ).status ).toBe( 'summarizing' )
  } )

  it( 'refuses a saved job', async () => {
    const id = await queueReviewed()
    await saveJob( id )

    await expect( regenerateSummary( id, {} ) ).rejects.toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown job', async () => {
    await expect( regenerateSummary( crypto.randomUUID(), {} ) ).rejects.toThrow( NotFoundError )
  } )

  it( 'rejects an unknown model or profile and leaves the job in review', async () => {
    const id = await queueReviewed()
    assertKnownModelMock.mockRejectedValueOnce( new ValidationError( 'Unknown model: nope' ) )

    await expect( regenerateSummary( id, { model: 'nope' } ) ).rejects.toThrow( ValidationError )
    await expect( regenerateSummary( id, { profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
    expect( findJob( id ).status ).toBe( 'ready_for_review' )
  } )
} )
