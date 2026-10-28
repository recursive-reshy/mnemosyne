// Packages
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
// App
import { ApiError } from './api/apiError'
import { meKeys } from './hooks/queryKeys'

export const createQueryClient = (): QueryClient => {
  // A 401 from any request means the session ended: ask for the user again, and the gate shows
  // the sign-in page.
  const handleError = ( error: Error ): void => {
    if( error instanceof ApiError && error.status === 401 ) {
      void client.invalidateQueries( { queryKey: meKeys.all } )
    }
  }

  const client: QueryClient = new QueryClient( {
    queryCache: new QueryCache( { onError: handleError } ),
    mutationCache: new MutationCache( { onError: handleError } ),
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  } )

  return client
}
