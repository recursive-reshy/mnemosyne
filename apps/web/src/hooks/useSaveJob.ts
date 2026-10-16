// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// App
import { saveJob } from '../api/jobs.api'
import { clearDraft } from './useDraft'
import { jobKeys } from './queryKeys'

export function useSaveJob( jobId: string ): UseMutationResult< string, Error, void > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: () => saveJob( jobId ),
    onSuccess: async () => {
      clearDraft( jobId )
      await queryClient.invalidateQueries( { queryKey: jobKeys.all } )
    },
  } )
}
