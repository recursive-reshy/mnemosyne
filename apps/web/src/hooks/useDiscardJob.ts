// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { discardJob } from '../api/jobs.api'
import { clearDraft } from './useDraft'
import { jobKeys } from './queryKeys'

interface DiscardContext {
  previous: Job[] | undefined
}

export function useDiscardJob(
  jobId: string,
): UseMutationResult< void, Error, void, DiscardContext > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: () => discardJob( jobId ),
    onMutate: async () => {
      await queryClient.cancelQueries( { queryKey: jobKeys.all, exact: true } )

      const previous = queryClient.getQueryData< Job[] >( jobKeys.all )

      queryClient.setQueryData< Job[] >(
        jobKeys.all,
        ( jobs ) => jobs?.filter( ( { id } ) => id !== jobId ),
      )

      return { previous }
    },
    onError: ( _error, _variables, context ) => {
      queryClient.setQueryData( jobKeys.all, context?.previous )
    },
    onSuccess: () => {
      clearDraft( jobId )
      queryClient.removeQueries( { queryKey: jobKeys.detail( jobId ) } )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries( { queryKey: jobKeys.all, exact: true } )
    },
  } )
}
