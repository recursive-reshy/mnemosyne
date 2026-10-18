// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { Job, SummarizeFeedItemsBody } from '@mnemosyne/shared'
// App
import { summarizeFeedItems } from '../api/feedItems.api'
import { feedKeys, jobKeys } from './queryKeys'

export function useSummarizeFeedItems(): UseMutationResult<
  Job[],
  Error,
  SummarizeFeedItemsBody
> {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( body: SummarizeFeedItemsBody ) => summarizeFeedItems( body ),
    onSuccess: async () => {
      await Promise.all( [
        queryClient.invalidateQueries( { queryKey: jobKeys.all, exact: true } ),
        queryClient.invalidateQueries( { queryKey: feedKeys.inbox } ),
        queryClient.invalidateQueries( { queryKey: feedKeys.all } ),
      ] )
    },
  } )
}
