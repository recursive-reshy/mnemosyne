// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { StatusRow } from '@mnemosyne/shared'
// App
import { getStatus } from '../api/status.api'
import { statusKeys } from './queryKeys'

const REFRESH_MS = 60_000

export interface StatusState {
  rows: StatusRow[]
  failingCount: number
  isLoading: boolean
  error: string | null
}

export function useStatus(): StatusState {
  const { data, error, isPending } = useQuery( {
    queryKey: statusKeys.all,
    queryFn: getStatus,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  } )

  return {
    rows: data?.rows ?? [],
    failingCount: data?.failing_count ?? 0,
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
