// Packages
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
// Shared
import type {
  GetSettingsResponse,
  Settings,
  UpdateSettingsBody,
} from '@mnemosyne/shared'
// App
import { getSettings, updateSettings } from '../api/settings.api'
import { settingsKeys } from './queryKeys'

export interface SettingsState {
  settings: Settings | null
  lockedInstructions: string | null
  isLoading: boolean
  error: string | null
  updateSettings: UseMutationResult< GetSettingsResponse, Error, UpdateSettingsBody >
}

export function useSettings(): SettingsState {
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery( {
    queryKey: settingsKeys.all,
    queryFn: getSettings,
  } )
  const update = useMutation( {
    mutationFn: ( body: UpdateSettingsBody ) => updateSettings( body ),
    onSuccess: ( response ) => {
      queryClient.setQueryData( settingsKeys.all, response )
    },
  } )

  return {
    settings: data?.settings ?? null,
    lockedInstructions: data?.locked_instructions.video ?? null,
    isLoading: isPending,
    error: error === null ? null : error.message,
    updateSettings: update,
  }
}
