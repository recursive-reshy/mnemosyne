// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
import request from 'supertest'
// Shared
import { Job } from '@mnemosyne/shared'
// App
import { app } from '../app.js'
// Repositories
import { clearJobs } from '../repositories/jobStore.repository.js'
// Services
import { completeJob, markStatus, queueJob } from '../services/jobs.service.js'
// Formatters
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatSrt } from '../formatters/srt.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

const youtubeUrl = 'https://www.youtube.com/watch?v=abc'

beforeEach( () => {
  clearJobs()
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
  const seedDoneJob = ( title?: string ): string => {
    const { id } = queueJob( youtubeUrl )

    markStatus( id, 'downloading' )
    markStatus( id, 'converting' )
    markStatus( id, 'transcribing' )
    completeJob( id, {
      ...transcriptFixture,
      meta: { ...transcriptFixture.meta, title: title ?? transcriptFixture.meta.title },
    } )

    return id
  }

  it.each( [
    [ 'md', 'text/markdown; charset=utf-8', formatMarkdown ],
    [ 'srt', 'application/x-subrip; charset=utf-8', formatSrt ],
    [ 'txt', 'text/plain; charset=utf-8', formatTxt ],
  ] as const )( 'downloads %s', async ( format, contentType, formatter ) => {
    const id = seedDoneJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=${ format }` )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toBe( contentType )
    expect( response.headers[ 'content-disposition' ] ).toBe(
      `attachment; filename="Video title.${ format }"`,
    )
    expect( response.text ).toBe( formatter( transcriptFixture ) )
  } )

  it( 'defaults to Markdown', async () => {
    const id = seedDoneJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download` )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toBe( 'text/markdown; charset=utf-8' )
    expect( response.text ).toBe( formatMarkdown( transcriptFixture ) )
  } )

  it.each( [ 'format=pdf', 'format=md&format=srt' ] )( 'rejects ?%s with 400', async ( query ) => {
    const id = seedDoneJob()

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
    const id = seedDoneJob( '日本語のタイトル' )

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=txt` )

    expect( response.headers[ 'content-disposition' ] ).toContain(
      `filename*=UTF-8''${ encodeURIComponent( '日本語のタイトル.txt' ) }`,
    )
  } )
} )
