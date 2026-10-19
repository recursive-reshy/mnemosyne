// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type { GmailAccount } from '@mnemosyne/shared'
// App
import { disconnectGmail, getGmailAccount } from '../api/gmail.api'
import { gmailKeys } from './queryKeys'

export interface GmailAccountState {
  account: GmailAccount | null
  isLoading: boolean
  error: string | null
  disconnect: UseMutationResult< void, Error, void >
}

export function useGmailAccount(): GmailAccountState {
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery( {
    queryKey: gmailKeys.account,
    queryFn: getGmailAccount,
  } )
  const disconnect = useMutation( {
    mutationFn: () => disconnectGmail(),
    onSuccess: () => queryClient.invalidateQueries( { queryKey: gmailKeys.account } ),
  } )

  return {
    account: data ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
    disconnect,
  }
}
