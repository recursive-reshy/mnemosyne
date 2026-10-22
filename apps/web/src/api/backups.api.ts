// Shared
import { BackupResult } from '@mnemosyne/shared'
// App
import { request } from './request'

export const runBackup = async (): Promise< BackupResult > => {
  return request( '/api/backups', BackupResult, { method: 'POST' } )
}
