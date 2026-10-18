// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { FeedItem } from '@mnemosyne/shared'
// App
import { listFeedItems } from '../api/feedItems.api'
import { feedKeys } from './queryKeys'

export const INBOX_POLL_MS = 60_000

export interface FeedInboxState {
  items: FeedItem[]
  isLoading: boolean
  error: string | null
}

export function useFeedInbox(): FeedInboxState {
  const { data, error, isPending } = useQuery( {
    queryKey: feedKeys.inbox,
    queryFn: listFeedItems,
    refetchInterval: INBOX_POLL_MS,
    refetchOnWindowFocus: true,
  } )

  return {
    items: data ?? [],
    isLoading: isPending,
    error: error === null ? null : error.message,
  }
}
