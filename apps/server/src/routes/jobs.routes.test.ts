// Node
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
import request from 'supertest'
// Shared
import {
  GetTranscriptResponse,
  Job,
  JobStatus,
  ListJobsResponse,
} from '@mnemosyne/shared'
// App
import { app } from '../app.js'
import { config } from '../config.js'
// Repositories
import { clearJobs, updateJob } from '../repositories/jobStore.repository.js'
// Services
import {
  completeSummary,
  completeTranscription,
  failJob,
  failSummary,
  markStatus,
  queueJob,
} from '../services/jobs.service.js'
// Formatters
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatSrt } from '../formatters/srt.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

const youtubeUrl = 'https://www.youtube.com/watch?v=abc'

const seedJobAt = ( status: JobStatus ): string => {
  const { id } = queueJob( youtubeUrl )
  const steps = [ 'downloading', 'converting', 'transcribing' ] as const

  if( status === 'queued' ) {
    return id
  }

  for( const step of steps ) {
    markStatus( id, step )

    if( step === status ) {
      return id
    }
  }

  if( status === 'failed' ) {
    failJob( id, 'boom' )

    return id
  }

  completeTranscription( id, transcriptFixture )

  if( status === 'ready_for_review' || status === 'saved' ) {
    completeSummary( id, '## Summary', [] )
  } else if( status === 'summary_failed' ) {
    failSummary( id, 'Rate limited' )
  }

  if( status === 'saved' ) {
    updateJob( id, { status: 'saved', transcript: null } )
  }

  return id
}

beforeEach( async () => {
  clearJobs()
  await rm( config.vaultPath, { recursive: true, force: true } )
} )

describe( 'POST /api/jobs', () => {
  it( 'accepts a valid https URL with 202 and a Location header', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: youtubeUrl } )

    const body = response.body as { job_id: string }
    expect( response.status ).toBe( 202 )
    expect( body.job_id ).toMatch( /^[0-9a-f-]{36}$/ )
    expect( response.headers.location ).toBe( `/api/jobs/${ body.job_id }` )
  } )

  it( 'accepts a valid http URL', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: 'http://example.com/v' } )

    expect( response.status ).toBe( 202 )
  } )

  it( 'rejects an ftp URL with 400 and issues', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: 'ftp://example.com/v' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( {
      error: 'Invalid request',
      issues: expect.any( Array ) as unknown[],
    } )
  } )

  it( 'rejects a missing url', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( {} )

    expect( response.status ).toBe( 400 )
  } )

  it( 'rejects a non-string url', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: 42 } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'rejects a request with no body', async () => {
    const response = await request( app ).post( '/api/jobs' )

    expect( response.status ).toBe( 400 )
  } )

  it( 'rejects malformed JSON with 400 Invalid JSON', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .set( 'content-type', 'application/json' )
      .send( '{"url":' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Invalid JSON' } )
  } )

  it( 'ignores extra fields', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: youtubeUrl, extra: 'ignored' } )

    expect( response.status ).toBe( 202 )
  } )
} )

describe( 'GET /api/jobs', () => {
  it( 'returns an empty list when there are no jobs', async () => {
    const response = await request( app ).get( '/api/jobs' )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { jobs: [] } )
  } )

  it( 'lists active jobs newest first, without transcripts', async () => {
    const first = queueJob( youtubeUrl )
    const second = queueJob( 'https://www.youtube.com/watch?v=def' )
    markStatus( second.id, 'downloading' )

    const response = await request( app ).get( '/api/jobs' )

    const { jobs } = ListJobsResponse.parse( response.body )
    expect( response.status ).toBe( 200 )
    expect( jobs.map( ( { id } ) => id ) ).toEqual( [ second.id, first.id ] )
    expect( JSON.stringify( response.body ) ).not.toContain( 'transcript"' )
  } )

  it( 'leaves out failed jobs', async () => {
    const { id } = queueJob( youtubeUrl )
    failJob( id, 'boom' )

    const response = await request( app ).get( '/api/jobs' )

    expect( response.body ).toEqual( { jobs: [] } )
  } )
} )

describe( 'GET /api/jobs/:id', () => {
  it( 'returns the queued public job after a POST', async () => {
    const created = await request( app ).post( '/api/jobs' ).send( { url: youtubeUrl } )
    const { job_id: jobId } = created.body as { job_id: string }

    const response = await request( app ).get( `/api/jobs/${ jobId }` )

    const { job } = response.body as { job: unknown }
    const parsed = Job.parse( job )
    expect( response.status ).toBe( 200 )
    expect( parsed ).toMatchObject( { id: jobId, url: youtubeUrl, status: 'queued' } )
    expect( job ).not.toHaveProperty( 'transcript' )
  } )

  it( 'returns 404 for an unknown UUID', async () => {
    const response = await request( app ).get( `/api/jobs/${ crypto.randomUUID() }` )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'returns 404 for a non-UUID id', async () => {
    const response = await request( app ).get( '/api/jobs/abc' )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'GET /api/jobs/:id/download', () => {
  const seedReviewJob = ( title?: string ): string => {
    const { id } = queueJob( youtubeUrl )

    markStatus( id, 'downloading' )
    markStatus( id, 'converting' )
    markStatus( id, 'transcribing' )
    completeTranscription( id, {
      ...transcriptFixture,
      meta: { ...transcriptFixture.meta, title: title ?? transcriptFixture.meta.title },
    } )
    completeSummary( id, '## Summary', [] )

    return id
  }

  it.each( [
    [ 'md', 'text/markdown; charset=utf-8', formatMarkdown ],
    [ 'srt', 'application/x-subrip; charset=utf-8', formatSrt ],
    [ 'txt', 'text/plain; charset=utf-8', formatTxt ],
  ] as const )( 'downloads %s', async ( format, contentType, formatter ) => {
    const id = seedReviewJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=${ format }` )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toBe( contentType )
    expect( response.headers[ 'content-disposition' ] ).toBe(
      `attachment; filename="Video title.${ format }"`,
    )
    expect( response.text ).toBe( formatter( transcriptFixture ) )
  } )

  it( 'defaults to Markdown', async () => {
    const id = seedReviewJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download` )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toBe( 'text/markdown; charset=utf-8' )
    expect( response.text ).toBe( formatMarkdown( transcriptFixture ) )
  } )

  it.each( [ 'format=pdf', 'format=md&format=srt' ] )( 'rejects ?%s with 400', async ( query ) => {
    const id = seedReviewJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download?${ query }` )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 400 for an invalid format even for an unknown id', async () => {
    const response = await request( app ).get( '/api/jobs/nope/download?format=pdf' )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown id', async () => {
    const response = await request( app ).get( `/api/jobs/${ crypto.randomUUID() }/download` )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'returns 409 for a queued job', async () => {
    const { id } = queueJob( youtubeUrl )

    const response = await request( app ).get( `/api/jobs/${ id }/download` )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Transcript not ready' } )
  } )

  it( 'encodes a non-ASCII title with filename*', async () => {
    const id = seedReviewJob( '日本語のタイトル' )

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=txt` )

    expect( response.headers[ 'content-disposition' ] ).toContain(
      `filename*=UTF-8''${ encodeURIComponent( '日本語のタイトル.txt' ) }`,
    )
  } )
} )

describe( 'GET /api/jobs/:id/transcript', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'returns the transcript when the job is %s',
    async ( status ) => {
      const id = seedJobAt( status )

      const response = await request( app ).get( `/api/jobs/${ id }/transcript` )

      expect( response.status ).toBe( 200 )
      expect( GetTranscriptResponse.parse( response.body ) ).toEqual( {
        transcript: transcriptFixture,
      } )
    },
  )

  it.each( [ 'queued', 'transcribing', 'summarizing', 'failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = seedJobAt( status )

      const response = await request( app ).get( `/api/jobs/${ id }/transcript` )

      expect( response.status ).toBe( 409 )
      expect( response.body ).toEqual( { error: 'Transcript not ready' } )
    },
  )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app ).get( `/api/jobs/${ crypto.randomUUID() }/transcript` )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'POST /api/jobs/:id/save', () => {
  const edits = { title: 'What Is RAG: A Primer', tags: [ 'rag' ], body: '## Summary\nEdited.' }

  it( 'writes the note into the vault and returns its path', async () => {
    const id = seedJobAt( 'ready_for_review' )

    const response = await request( app ).post( `/api/jobs/${ id }/save` ).send( edits )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { saved_path: 'Mnemosyne/What Is RAG A Primer.md' } )

    const notePath = join( config.vaultPath, 'Mnemosyne/What Is RAG A Primer.md' )
    const note = await readFile( notePath, 'utf8' )
    expect( note ).toContain( 'title: "What Is RAG: A Primer"' )
    expect( note ).toContain( 'tags: [mnemosyne, rag]' )
    expect( note.endsWith( '## Summary\nEdited.\n' ) ).toBe( true )
  } )

  it( 'removes the transcript: the job is saved and downloads are refused', async () => {
    const id = seedJobAt( 'ready_for_review' )
    await request( app ).post( `/api/jobs/${ id }/save` ).send( edits )

    const job = await request( app ).get( `/api/jobs/${ id }` )
    const download = await request( app ).get( `/api/jobs/${ id }/download` )

    expect( job.body ).toMatchObject( { job: { status: 'saved' } } )
    expect( download.status ).toBe( 409 )
  } )

  it( 'suffixes the file name when the title is already in the vault', async () => {
    const first = seedJobAt( 'ready_for_review' )
    const second = seedJobAt( 'ready_for_review' )

    await request( app ).post( `/api/jobs/${ first }/save` ).send( edits )
    const response = await request( app ).post( `/api/jobs/${ second }/save` ).send( edits )

    expect( response.body ).toEqual( { saved_path: 'Mnemosyne/What Is RAG A Primer (2).md' } )
  } )

  it.each( [
    [ 'a blank title', { ...edits, title: '   ' } ],
    [ 'missing tags', { title: 'T', body: 'x' } ],
    [ 'a non-string body', { ...edits, body: 5 } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const id = seedJobAt( 'ready_for_review' )

    const response = await request( app ).post( `/api/jobs/${ id }/save` ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app )
      .post( `/api/jobs/${ crypto.randomUUID() }/save` )
      .send( edits )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'summarizing', 'summary_failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = seedJobAt( status )

      const response = await request( app ).post( `/api/jobs/${ id }/save` ).send( edits )

      expect( response.status ).toBe( 409 )
    },
  )
} )

describe( 'POST /api/jobs/:id/retry-summary', () => {
  it( 'returns 202 with the job back in summarizing', async () => {
    const id = seedJobAt( 'summary_failed' )

    const response = await request( app ).post( `/api/jobs/${ id }/retry-summary` )

    expect( response.status ).toBe( 202 )
    expect( Job.parse( ( response.body as { job: unknown } ).job ) ).toMatchObject( {
      id,
      status: 'summarizing',
      error: null,
      expires_at: null,
    } )
  } )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app )
      .post( `/api/jobs/${ crypto.randomUUID() }/retry-summary` )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'summarizing', 'ready_for_review', 'failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = seedJobAt( status )

      const response = await request( app ).post( `/api/jobs/${ id }/retry-summary` )

      expect( response.status ).toBe( 409 )
    },
  )
} )

describe( 'DELETE /api/jobs/:id', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'discards a job that is %s with 204',
    async ( status ) => {
      const id = seedJobAt( status )

      const response = await request( app ).delete( `/api/jobs/${ id }` )

      expect( response.status ).toBe( 204 )
      expect( ( await request( app ).get( `/api/jobs/${ id }` ) ).status ).toBe( 404 )
      expect( ( await request( app ).get( '/api/jobs' ) ).body ).toEqual( { jobs: [] } )
    },
  )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app ).delete( `/api/jobs/${ crypto.randomUUID() }` )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'transcribing', 'summarizing', 'failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = seedJobAt( status )

      const response = await request( app ).delete( `/api/jobs/${ id }` )

      expect( response.status ).toBe( 409 )
      expect( ( await request( app ).get( `/api/jobs/${ id }` ) ).status ).toBe( 200 )
    },
  )
} )
