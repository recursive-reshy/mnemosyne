// Shared
import { GetSettingsResponse } from '@mnemosyne/shared'
import type { UpdateSettingsBody } from '@mnemosyne/shared'
// App
import { request } from './request'

export const getSettings = async (): Promise< GetSettingsResponse > => {
  return request( '/api/settings', GetSettingsResponse )
}

export const updateSettings = async (
  body: UpdateSettingsBody,
): Promise< GetSettingsResponse > => {
  return request( '/api/settings', GetSettingsResponse, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )
}
