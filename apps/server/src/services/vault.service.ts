// Node
import { join } from 'node:path'
// Shared
import { ListFoldersResponse } from '@mnemosyne/shared'
// Clients
import { listFolderTree } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Errors
import { NotFoundError, VaultNotChosenError } from '../errors.js'
// Repositories
import { findUserById } from '../repositories/users.repository.js'

export const vaultRootFor = ( userId: string ): string => {
  const user = findUserById( userId )

  if( user === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  if( user.vault_dir === null ) {
    throw new VaultNotChosenError()
  }

  return join( config.vaultsPath, user.vault_dir )
}

export const listFolders = async ( userId: string ): Promise< ListFoldersResponse > => {
  return {
    default_folder: config.defaultNoteFolder,
    folders: await listFolderTree( vaultRootFor( userId ) ),
  }
}
