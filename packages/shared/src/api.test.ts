// Packages
import { describe, it, expect } from 'vitest'
// Api
import {
  CreateJobBody,
  CreateJobResponse,
  DownloadFormat,
  GetJobResponse,
} from './api.js'

const jobId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

describe( 'CreateJobBody', () => {
  it.each( [ 'http://example.com/v', 'https://www.youtube.com/watch?v=abc' ] )(
    'accepts %s',
    ( url ) => {
      expect( CreateJobBody.safeParse( { url } ).success ).toBe( true )
    },
  )

  it.each( [ 'ftp://example.com/v', 'javascript:alert(1)', 'not a url' ] )(
    'rejects %s',
    ( url ) => {
      expect( CreateJobBody.safeParse( { url } ).success ).toBe( false )
    },
  )

  it( 'rejects a missing url', () => {
    expect( CreateJobBody.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'CreateJobResponse', () => {
  it( 'accepts a UUID job_id', () => {
    expect( CreateJobResponse.safeParse( { job_id: jobId } ).success ).toBe( true )
  } )

  it( 'rejects a non-UUID job_id', () => {
    expect( CreateJobResponse.safeParse( { job_id: '1' } ).success ).toBe( false )
  } )
} )

describe( 'GetJobResponse', () => {
  const job = {
    id: jobId,
    url: 'https://example.com/v',
    status: 'done',
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
  }

  it( 'accepts a job', () => {
    expect( GetJobResponse.safeParse( { job } ).success ).toBe( true )
  } )

  it( 'rejects an invalid job', () => {
    expect( GetJobResponse.safeParse( { job: { ...job, id: 'x' } } ).success ).toBe( false )
  } )
} )

describe( 'DownloadFormat', () => {
  it.each( [ 'md', 'srt', 'txt' ] )( 'accepts %s', ( format ) => {
    expect( DownloadFormat.safeParse( format ).success ).toBe( true )
  } )

  it( 'rejects pdf', () => {
    expect( DownloadFormat.safeParse( 'pdf' ).success ).toBe( false )
  } )
} )
