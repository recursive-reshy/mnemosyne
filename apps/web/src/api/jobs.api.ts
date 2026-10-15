// Shared
import {
  CreateJobResponse,
  ErrorResponse,
  GetJobResponse,
  GetTranscriptResponse,
  ListJobsResponse,
  SaveJobResponse,
} from '@mnemosyne/shared'
import type {
  CreateJobBody,
  DownloadFormat,
  Job,
  SaveJobBody,
  Transcript,
} from '@mnemosyne/shared'
// App
import { ApiError } from './apiError'

interface Schema< T > {
  safeParse( data: unknown ): { success: true, data: T } | { success: false }
}

const send = async ( input: string, init?: RequestInit ): Promise< Response > => {
  let response: Response

  try {
    response = await fetch( input, init )
  } catch{
    throw new ApiError( 'Could not reach the server', null )
  }

  if( !response.ok ) {
    const body: unknown = await response.json().catch( () => null )
    const parsedError = ErrorResponse.safeParse( body )

    throw new ApiError(
      parsedError.success
        ? parsedError.data.error
        : `Request failed with status ${ response.status }`,
      response.status,
    )
  }

  return response
}

const request = async < T >(
  input: string,
  schema: Schema< T >,
  init?: RequestInit,
): Promise< T > => {
  const response = await send( input, init )
  const body: unknown = await response.json().catch( () => null )
  const parsed = schema.safeParse( body )

  if( !parsed.success ) {
    throw new ApiError( 'Unexpected response from the server', response.status )
  }

  return parsed.data
}

const jobPath = ( id: string ): string => `/api/jobs/${ encodeURIComponent( id ) }`

export const createJob = async ( url: string ): Promise< string > => {
  const body: CreateJobBody = { url }
  const { job_id } = await request( '/api/jobs', CreateJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )
  return job_id
}

export const getJob = async ( id: string ): Promise< Job > => {
  const { job } = await request( jobPath( id ), GetJobResponse )
  return job
}

export const listJobs = async (): Promise< Job[] > => {
  const { jobs } = await request( '/api/jobs', ListJobsResponse )
  return jobs
}

export const getTranscript = async ( id: string ): Promise< Transcript > => {
  const { transcript } = await request( `${ jobPath( id ) }/transcript`, GetTranscriptResponse )
  return transcript
}

export const saveJob = async ( id: string, edits: SaveJobBody ): Promise< string > => {
  const { saved_path } = await request( `${ jobPath( id ) }/save`, SaveJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( edits ),
  } )
  return saved_path
}

export const retrySummary = async ( id: string ): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/retry-summary`, GetJobResponse, {
    method: 'POST',
  } )
  return job
}

export const discardJob = async ( id: string ): Promise< void > => {
  await send( jobPath( id ), { method: 'DELETE' } )
}

export const downloadUrl = ( id: string, format: DownloadFormat ): string => {
  return `/api/jobs/${ encodeURIComponent( id ) }/download?format=${ format }`
}
