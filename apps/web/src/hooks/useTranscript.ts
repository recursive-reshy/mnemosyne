// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { Transcript } from '@mnemosyne/shared'
// App
import { getTranscript } from '../api/jobs.api'
import { jobKeys } from './queryKeys'

export interface TranscriptState {
  transcript: Transcript | null
  error: string | null
}

export function useTranscript( jobId: string | null ): TranscriptState {
  const { data, error } = useQuery( {
    queryKey: jobKeys.transcript( jobId ?? '' ),
    queryFn: () => getTranscript( jobId ?? '' ),
    enabled: jobId !== null,
    staleTime: Infinity,
  } )

  return {
    transcript: data ?? null,
    error: error === null ? null : error.message,
  }
}
