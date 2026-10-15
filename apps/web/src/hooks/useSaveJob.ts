// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { SaveJobBody } from '@mnemosyne/shared'
// App
import { saveJob } from '../api/jobs.api'
import { clearDraft } from './useDraft'
import { jobKeys } from './queryKeys'

export function useSaveJob(
  jobId: string,
): UseMutationResult< string, Error, SaveJobBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: ( edits: SaveJobBody ) => saveJob( jobId, edits ),
    onSuccess: async () => {
      clearDraft( jobId )
      await queryClient.invalidateQueries( { queryKey: jobKeys.all } )
    },
  } )
}
