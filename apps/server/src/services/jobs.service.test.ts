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
import { ConflictError, NotFoundError } from '../errors.js'
// Repositories
import { clearJobs, findJobById, updateJob } from '../repositories/jobStore.repository.js'
// Services
import {
  completeJob,
  completeSummary,
  completeTranscription,
  failJob,
  failSummary,
  findJob,
  findNextQueuedJob,
  getTranscript,
  markStatus,
  queueJob,
  recoverInterruptedJobs,
  renderTranscript,
} from './jobs.service.js'
// Formatters
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatSrt } from '../formatters/srt.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

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

const queueJobAt = ( status: JobStatus ): string => {
  const { id } = queueJob( url )
  const path: JobStatus[] = [ 'downloading', 'converting', 'transcribing' ]

  for( const step of path ) {
    if( status === 'queued' ) break
    markStatus( id, step as 'downloading' | 'converting' | 'transcribing' )
    if( step === status ) break
  }
  if( status === 'done' ) completeJob( id, transcript )
  if( status === 'failed' ) failJob( id, 'earlier failure' )

  return id
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( startTime )
  clearJobs()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'queueJob', () => {
  it( 'returns a queued public job', () => {
    const job = queueJob( url )

    expect( job ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      url,
      status: 'queued',
      error: null,
      created_at: startTime.toISOString(),
      updated_at: startTime.toISOString(),
      title: null,
      summary_markdown: null,
      suggested_tags: [],
      expires_at: null,
      saved_path: null,
    } )
  } )

  it( 'does not expose a transcript property', () => {
    expect( queueJob( url ) ).not.toHaveProperty( 'transcript' )
  } )

  it( 'produces a different id on each call', () => {
    expect( queueJob( url ).id ).not.toBe( queueJob( url ).id )
  } )
} )

describe( 'findJob', () => {
  it( 'returns the public job', () => {
    const { id } = queueJob( url )

    const job = findJob( id )

    expect( job.id ).toBe( id )
    expect( job ).not.toHaveProperty( 'transcript' )
  } )

  it( 'returns the summary fields of a stored job', () => {
    const { id } = queueJob( url )
    updateJob( id, {
      title: 'A talk',
      summary_markdown: '## Summary',
      suggested_tags: [ 'rust' ],
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )

    expect( findJob( id ) ).toMatchObject( {
      title: 'A talk',
      summary_markdown: '## Summary',
      suggested_tags: [ 'rust' ],
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => findJob( 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'markStatus', () => {
  it( 'walks queued to transcribing', () => {
    const { id } = queueJob( url )

    expect( markStatus( id, 'downloading' ).status ).toBe( 'downloading' )
    expect( markStatus( id, 'converting' ).status ).toBe( 'converting' )
    expect( markStatus( id, 'transcribing' ).status ).toBe( 'transcribing' )
  } )

  it( 'updates updated_at and keeps created_at', () => {
    const { id } = queueJob( url )
    vi.setSystemTime( laterTime )

    const job = markStatus( id, 'downloading' )

    expect( job.updated_at ).toBe( laterTime.toISOString() )
    expect( job.created_at ).toBe( startTime.toISOString() )
  } )

  it( 'throws ConflictError when skipping a step', () => {
    const { id } = queueJob( url )

    expect( () => markStatus( id, 'converting' ) ).toThrow( ConflictError )
    expect( () => markStatus( id, 'converting' ) ).toThrow(
      'Cannot move job from queued to converting',
    )
  } )

  it( 'throws ConflictError when moving backwards', () => {
    const id = queueJobAt( 'converting' )

    expect( () => markStatus( id, 'downloading' ) ).toThrow( ConflictError )
  } )

  it( 'throws ConflictError from a final status', () => {
    const id = queueJobAt( 'failed' )

    expect( () => markStatus( id, 'downloading' ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => markStatus( 'missing', 'downloading' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'completeJob', () => {
  it( 'marks a transcribing job done and stores the transcript', () => {
    const id = queueJobAt( 'transcribing' )

    const job = completeJob( id, transcript )

    expect( job.status ).toBe( 'done' )
    expect( job ).not.toHaveProperty( 'transcript' )
    expect( findJobById( id )?.transcript ).toEqual( transcript )
  } )

  it.each( [ 'queued', 'downloading', 'converting', 'done', 'failed' ] as const )(
    'throws ConflictError from %s and changes nothing',
    ( status ) => {
      const id = queueJobAt( status )
      const before = findJobById( id )

      expect( () => completeJob( id, transcript ) ).toThrow( ConflictError )
      expect( findJobById( id ) ).toEqual( before )
    },
  )
} )

describe( 'failJob', () => {
  it.each( [ 'queued', 'downloading', 'converting', 'transcribing' ] as const )(
    'fails a job from %s with the message',
    ( status ) => {
      const id = queueJobAt( status )

      const job = failJob( id, 'yt-dlp exited with 1' )

      expect( job.status ).toBe( 'failed' )
      expect( job.error ).toBe( 'yt-dlp exited with 1' )
    },
  )

  it.each( [ 'done', 'failed' ] as const )( 'throws ConflictError from %s', ( status ) => {
    const id = queueJobAt( status )

    expect( () => failJob( id, 'late' ) ).toThrow( ConflictError )
  } )
} )

describe( 'renderTranscript', () => {
  const queueDoneJob = (): string => {
    const { id } = queueJob( url )

    markStatus( id, 'downloading' )
    markStatus( id, 'converting' )
    markStatus( id, 'transcribing' )
    completeJob( id, transcriptFixture )

    return id
  }

  it.each( [
    [ 'md', 'Video title.md', 'text/markdown; charset=utf-8', formatMarkdown ],
    [ 'srt', 'Video title.srt', 'application/x-subrip; charset=utf-8', formatSrt ],
    [ 'txt', 'Video title.txt', 'text/plain; charset=utf-8', formatTxt ],
  ] as const )( 'renders a done job as %s', ( format, filename, contentType, formatter ) => {
    const id = queueDoneJob()

    const rendered = renderTranscript( id, format )

    expect( rendered ).toEqual( {
      filename,
      contentType,
      body: formatter( transcriptFixture ),
    } )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => renderTranscript( 'missing', 'md' ) ).toThrow( NotFoundError )
  } )

  it.each( [ 'queued', 'downloading', 'converting', 'transcribing', 'failed' ] as const )(
    'throws ConflictError from %s',
    ( status ) => {
      const id = queueJobAt( status )

      expect( () => renderTranscript( id, 'md' ) ).toThrow(
        new ConflictError( 'Transcript not ready' ),
      )
    },
  )
} )

describe( 'findNextQueuedJob', () => {
  it( 'returns undefined when no jobs exist', () => {
    expect( findNextQueuedJob() ).toBeUndefined()
  } )

  it( 'returns the oldest queued job', () => {
    const first = queueJob( 'https://example.com/a' )
    queueJob( 'https://example.com/b' )

    expect( findNextQueuedJob() ).toEqual( first )
  } )

  it( 'skips jobs that are no longer queued', () => {
    const first = queueJob( 'https://example.com/a' )
    const second = queueJob( 'https://example.com/b' )
    markStatus( first.id, 'downloading' )

    expect( findNextQueuedJob() ).toEqual( second )
  } )

  it( 'returns undefined when every job has moved on', () => {
    const first = queueJob( 'https://example.com/a' )
    const second = queueJob( 'https://example.com/b' )
    markStatus( first.id, 'downloading' )
    markStatus( second.id, 'downloading' )

    expect( findNextQueuedJob() ).toBeUndefined()
  } )

  it( 'returns a job without a transcript field', () => {
    queueJob( 'https://example.com/a' )

    expect( findNextQueuedJob() ).not.toHaveProperty( 'transcript' )
  } )
} )

describe( 'recoverInterruptedJobs', () => {
  it( 'fails jobs left mid-processing and returns how many', () => {
    const queued = queueJobAt( 'queued' )
    const downloading = queueJobAt( 'downloading' )
    const transcribing = queueJobAt( 'transcribing' )
    const finished = queueJobAt( 'done' )
    vi.setSystemTime( laterTime )

    expect( recoverInterruptedJobs() ).toBe( 2 )

    expect( findJob( downloading ) ).toMatchObject( {
      status: 'failed',
      error: 'Interrupted by restart',
      updated_at: laterTime.toISOString(),
    } )
    expect( findJob( transcribing ).status ).toBe( 'failed' )
    expect( findJob( queued ).status ).toBe( 'queued' )
    expect( findJob( finished ).status ).toBe( 'done' )
  } )

  it( 'returns 0 when nothing needs recovery', () => {
    expect( recoverInterruptedJobs() ).toBe( 0 )
  } )
} )

const queueSummarizing = (): string => {
  const id = queueJobAt( 'transcribing' )
  completeTranscription( id, transcript )

  return id
}

describe( 'completeTranscription', () => {
  it( 'moves a transcribing job to summarizing and stores transcript and title', () => {
    const id = queueJobAt( 'transcribing' )

    const job = completeTranscription( id, transcript )

    expect( job.status ).toBe( 'summarizing' )
    expect( job.title ).toBe( 'A talk' )
    expect( job ).not.toHaveProperty( 'transcript' )
    expect( findJobById( id )?.transcript ).toEqual( transcript )
  } )

  it.each( [ 'queued', 'downloading', 'converting', 'failed' ] as const )(
    'throws ConflictError from %s and changes nothing',
    ( status ) => {
      const id = queueJobAt( status )
      const before = findJobById( id )

      expect( () => completeTranscription( id, transcript ) ).toThrow( ConflictError )
      expect( findJobById( id ) ).toEqual( before )
    },
  )
} )

describe( 'completeSummary', () => {
  it( 'stores the summary and tags and sets the expiry from the review TTL', () => {
    const id = queueSummarizing()

    const job = completeSummary( id, '## Summary\nText', [ 'rust' ] )

    expect( job ).toMatchObject( {
      status: 'ready_for_review',
      summary_markdown: '## Summary\nText',
      suggested_tags: [ 'rust' ],
      error: null,
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
  } )

  it.each( [ 'queued', 'transcribing', 'failed' ] as const )(
    'throws ConflictError from %s',
    ( status ) => {
      const id = queueJobAt( status )

      expect( () => completeSummary( id, 'x', [] ) ).toThrow( ConflictError )
    },
  )

  it( 'throws ConflictError when called twice', () => {
    const id = queueSummarizing()
    completeSummary( id, 'x', [] )

    expect( () => completeSummary( id, 'y', [] ) ).toThrow( ConflictError )
  } )
} )

describe( 'failSummary', () => {
  it( 'moves a summarizing job to summary_failed with the error and an expiry', () => {
    const id = queueSummarizing()

    const job = failSummary( id, 'Rate limited' )

    expect( job ).toMatchObject( {
      status: 'summary_failed',
      error: 'Rate limited',
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
    expect( findJobById( id )?.transcript ).toEqual( transcript )
  } )

  it( 'throws ConflictError from a non-summarizing status', () => {
    const id = queueJobAt( 'transcribing' )

    expect( () => failSummary( id, 'x' ) ).toThrow( ConflictError )
  } )
} )

describe( 'failJob after the summary steps', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'refuses to fail a job in %s',
    ( status ) => {
      const id = queueSummarizing()

      if( status === 'ready_for_review' ) {
        completeSummary( id, 'x', [] )
      } else {
        failSummary( id, 'x' )
      }

      expect( () => failJob( id, 'late' ) ).toThrow( ConflictError )
      expect( findJob( id ).status ).toBe( status )
    },
  )

  it( 'refuses to fail a saved job', () => {
    const id = queueSummarizing()
    completeSummary( id, 'x', [] )
    updateJob( id, { status: 'saved' } )

    expect( () => failJob( id, 'late' ) ).toThrow( ConflictError )
  } )

  it( 'can still fail a summarizing job', () => {
    const id = queueSummarizing()

    expect( failJob( id, 'boom' ).status ).toBe( 'failed' )
  } )
} )

describe( 'getTranscript', () => {
  it( 'returns the stored transcript', () => {
    const id = queueSummarizing()

    expect( getTranscript( id ) ).toEqual( transcript )
  } )

  it( 'throws NotFoundError for an unknown job', () => {
    expect( () => getTranscript( 'missing' ) ).toThrow( NotFoundError )
  } )

  it( 'throws when the job has no transcript', () => {
    const { id } = queueJob( url )

    expect( () => getTranscript( id ) ).toThrow( 'has no transcript' )
  } )
} )
