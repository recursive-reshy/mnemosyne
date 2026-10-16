// Packages
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import { parseNote, serializeNote } from '@mnemosyne/shared'
import type { SaveJobBody } from '@mnemosyne/shared'
// App
import { saveJob, updateDraft } from '../api/jobs.api'
import { clearDraft } from './useDraft'
import { jobKeys } from './queryKeys'

// Interim until the review screen autosaves the draft itself (task 5.4).
const withEdits = ( noteMarkdown: string, edits: SaveJobBody ): string => {
  const { properties } = parseNote( noteMarkdown )

  return serializeNote( {
    properties: { ...properties, title: edits.title, tags: [ 'mnemosyne', ...edits.tags ] },
    body: `${ edits.body.trim() }\n`,
  } )
}

export function useSaveJob(
  jobId: string,
  noteMarkdown: string | null,
): UseMutationResult< string, Error, SaveJobBody > {
  const queryClient = useQueryClient()

  return useMutation( {
    mutationFn: async ( edits: SaveJobBody ) => {
      if( noteMarkdown !== null ) {
        await updateDraft( jobId, { note_markdown: withEdits( noteMarkdown, edits ) } )
      }

      return saveJob( jobId )
    },
    onSuccess: async () => {
      clearDraft( jobId )
      await queryClient.invalidateQueries( { queryKey: jobKeys.all } )
    },
  } )
}
