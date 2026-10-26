// Shared
import { ListFoldersResponse } from '@mnemosyne/shared'
// Clients
import { listFolderTree } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Errors
import { NotFoundError } from '../errors.js'
// Repositories
import { findUserById } from '../repositories/users.repository.js'

// INTERIM (task 5.1 gives each user their own vault): everyone shares the one vault until then
export const vaultRootFor = ( userId: string ): string => {
  if( findUserById( userId ) === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  return config.vaultPath
}

export const listFolders = async ( userId: string ): Promise< ListFoldersResponse > => {
  return {
    default_folder: config.defaultNoteFolder,
    folders: await listFolderTree( vaultRootFor( userId ) ),
  }
}
