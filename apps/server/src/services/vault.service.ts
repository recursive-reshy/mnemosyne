// Shared
import { ListFoldersResponse } from '@mnemosyne/shared'
// Clients
import { listFolderTree } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'

export const listFolders = async (): Promise< ListFoldersResponse > => {
  return {
    default_folder: config.defaultNoteFolder,
    folders: await listFolderTree( config.vaultPath ),
  }
}
