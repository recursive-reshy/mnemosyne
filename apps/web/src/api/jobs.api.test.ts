// Shared
import type { DownloadFormat } from '@mnemosyne/shared'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { jobFixture } from '../test-support/job.fixture'
import { ApiError } from './apiError'
import { createJob, downloadUrl, getJob } from './jobs.api'

const fetchMock = vi.fn()
const jobId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

function jsonResponse( body: unknown, status: number ): Response {
  return new Response( JSON.stringify( body ), { status } )
}

async function rejection( promise: Promise< unknown > ): Promise< ApiError > {
  const error: unknown = await promise.then( () => null, ( reason: unknown ) => reason )
  expect( error ).toBeInstanceOf( ApiError )
  return error as ApiError
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'createJob', () => {
  const url = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'

  it( 'posts the url as JSON', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job_id: jobId }, 202 ) )

    await createJob( url )

    expect( fetchMock ).toHaveBeenCalledWith( '/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { url } ),
    } )
  } )

  it( 'returns the job id', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job_id: jobId }, 202 ) )

    await expect( createJob( url ) ).resolves.toBe( jobId )
  } )

  it( 'uses the server error message on a non-2xx response', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Invalid request', issues: [] }, 400 ) )

    const error = await rejection( createJob( url ) )

    expect( error.message ).toBe( 'Invalid request' )
    expect( error.status ).toBe( 400 )
  } )

  it( 'falls back to the status when the error body is not parseable', async () => {
    fetchMock.mockResolvedValue( new Response( 'boom', { status: 500 } ) )

    const error = await rejection( createJob( url ) )

    expect( error.message ).toBe( 'Request failed with status 500' )
    expect( error.status ).toBe( 500 )
  } )

  it( 'reports an unreachable server', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'Failed to fetch' ) )

    const error = await rejection( createJob( url ) )

    expect( error.message ).toBe( 'Could not reach the server' )
    expect( error.status ).toBeNull()
  } )

  it( 'rejects a 2xx response without a job id', async () => {
    fetchMock.mockResolvedValue( jsonResponse( {}, 202 ) )

    const error = await rejection( createJob( url ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
    expect( error.status ).toBe( 202 )
  } )
} )

describe( 'getJob', () => {
  it( 'requests the job with its id encoded', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job: jobFixture() }, 200 ) )

    await getJob( 'a/b' )

    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( '/api/jobs/a%2Fb' )
  } )

  it( 'returns the parsed job', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job: jobFixture() }, 200 ) )

    await expect( getJob( jobId ) ).resolves.toEqual( jobFixture() )
  } )

  it( 'uses the server error message for a missing job', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Job not found' }, 404 ) )

    const error = await rejection( getJob( jobId ) )

    expect( error.message ).toBe( 'Job not found' )
    expect( error.status ).toBe( 404 )
  } )

  it( 'rejects a job that does not match the schema', async () => {
    const job = { ...jobFixture(), status: 'exploded' }
    fetchMock.mockResolvedValue( jsonResponse( { job }, 200 ) )

    const error = await rejection( getJob( jobId ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )

describe( 'downloadUrl', () => {
  it.each< DownloadFormat >( [ 'md', 'srt', 'txt' ] )( 'builds the %s link', ( format ) => {
    expect( downloadUrl( 'a/b', format ) ).toBe( `/api/jobs/a%2Fb/download?format=${ format }` )
  } )
} )
