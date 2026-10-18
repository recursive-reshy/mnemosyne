// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// App
import { dismissFeedItems } from '../api/feedItems.api'
import { feedKeys } from './queryKeys'

export function useDismissFeedItems(): UseMutationResult< void, Error, string[] > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( ids: string[] ) => dismissFeedItems( ids ),
    onSuccess: async () => {
      await Promise.all( [
        queryClient.invalidateQueries( { queryKey: feedKeys.inbox } ),
        queryClient.invalidateQueries( { queryKey: feedKeys.all } ),
      ] )
    },
  } )
}
