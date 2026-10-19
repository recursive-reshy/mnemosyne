// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { InboxItemRef } from '@mnemosyne/shared'
// App
import { dismissFeedItems } from '../api/feedItems.api'
import { feedKeys } from './queryKeys'

export function useDismissFeedItems(): UseMutationResult< void, Error, InboxItemRef[] > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( items: InboxItemRef[] ) => dismissFeedItems( items ),
    onSuccess: async () => {
      await Promise.all( [
        queryClient.invalidateQueries( { queryKey: feedKeys.inbox } ),
        queryClient.invalidateQueries( { queryKey: feedKeys.all } ),
      ] )
    },
  } )
}
