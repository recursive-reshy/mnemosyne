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
