// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Packages
import type { QueryClient } from '@tanstack/react-query'
// App
import { ApiError } from './api/apiError'
import { meKeys } from './hooks/queryKeys'
import { createQueryClient } from './queryClient'

describe( 'createQueryClient', () => {
  it( 'does not retry failed queries or refetch on window focus', () => {
    const { queries } = createQueryClient().getDefaultOptions()

    expect( queries?.retry ).toBe( false )
    expect( queries?.refetchOnWindowFocus ).toBe( false )
  } )

  it( 'does not retry failed mutations', () => {
    expect( createQueryClient().getDefaultOptions().mutations?.retry ).toBe( false )
  } )

  describe( 'a 401', () => {
    const failQuery = async ( client: QueryClient, error: Error ): Promise< void > => {
      await client.fetchQuery( { queryKey: [ 'other' ], queryFn: () => Promise.reject( error ) } )
        .catch( () => null )
    }

    it( 'from a query refreshes the signed-in user', async () => {
      const client = createQueryClient()
      const invalidate = vi.spyOn( client, 'invalidateQueries' )

      await failQuery( client, new ApiError( 'unauthenticated', 401 ) )

      expect( invalidate ).toHaveBeenCalledWith( { queryKey: meKeys.all } )
    } )

    it( 'from a mutation refreshes the signed-in user', async () => {
      const client = createQueryClient()
      const invalidate = vi.spyOn( client, 'invalidateQueries' )

      await client.getMutationCache().build( client, {
        mutationFn: () => Promise.reject( new ApiError( 'unauthenticated', 401 ) ),
      } ).execute( undefined ).catch( () => null )

      expect( invalidate ).toHaveBeenCalledWith( { queryKey: meKeys.all } )
    } )

    it( 'is the only error that does', async () => {
      const client = createQueryClient()
      const invalidate = vi.spyOn( client, 'invalidateQueries' )

      await failQuery( client, new ApiError( 'Nope', 409 ) )
      await failQuery( client, new Error( 'Boom' ) )

      expect( invalidate ).not.toHaveBeenCalled()
    } )
  } )

  it( 'returns a separate client each time', () => {
    expect( createQueryClient() ).not.toBe( createQueryClient() )
  } )
} )
