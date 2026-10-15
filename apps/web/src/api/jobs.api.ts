// Shared
import { CreateJobResponse, ErrorResponse, GetJobResponse } from '@mnemosyne/shared'
import type { CreateJobBody, DownloadFormat, Job } from '@mnemosyne/shared'
// App
import { ApiError } from './apiError'

interface Schema< T > {
  safeParse( data: unknown ): { success: true, data: T } | { success: false }
}

const request = async < T >(
  input: string,
  schema: Schema< T >,
  init?: RequestInit,
): Promise< T > => {
  let response: Response

  try {
    response = await fetch( input, init )
  } catch{
    throw new ApiError( 'Could not reach the server', null )
  }

  const body: unknown = await response.json().catch( () => null )

  if( !response.ok ) {
    const parsedError = ErrorResponse.safeParse( body )

    throw new ApiError(
      parsedError.success
        ? parsedError.data.error
        : `Request failed with status ${ response.status }`,
      response.status,
    )
  }

  const parsed = schema.safeParse( body )

  if( !parsed.success ) {
    throw new ApiError( 'Unexpected response from the server', response.status )
  }

  return parsed.data
}

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
  const { job } = await request( `/api/jobs/${ encodeURIComponent( id ) }`, GetJobResponse )
  return job
}

export const downloadUrl = ( id: string, format: DownloadFormat ): string => {
  return `/api/jobs/${ encodeURIComponent( id ) }/download?format=${ format }`
}
