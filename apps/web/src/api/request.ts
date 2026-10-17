// Shared
import { ErrorResponse } from '@mnemosyne/shared'
// App
import { ApiError } from './apiError'

export interface Schema< T > {
  safeParse( data: unknown ): { success: true, data: T } | { success: false }
}

export const send = async ( input: string, init?: RequestInit ): Promise< Response > => {
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

export const request = async < T >(
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
