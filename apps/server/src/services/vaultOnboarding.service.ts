// Node
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rmdir,
} from 'node:fs/promises'
import { join } from 'node:path'
// Shared
import { VaultDir } from '@mnemosyne/shared'
import type { VaultChoice } from '@mnemosyne/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import {
  findUserById,
  listClaimedVaultDirs,
  setVaultDir,
} from '../repositories/users.repository.js'

const requireUserWithoutVault = ( userId: string ): void => {
  const user = findUserById( userId )

  if( user === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  if( user.vault_dir !== null ) {
    throw new ConflictError( 'You already have a vault' )
  }
}

// The unique column is what decides a race; the check before it only gives a friendlier message.
// There is no await between the two, so one user's two requests can't both get through.
const bind = ( userId: string, vaultDir: string ): void => {
  requireUserWithoutVault( userId )

  if( !setVaultDir( userId, vaultDir ).ok ) {
    throw new ConflictError( 'That vault is already taken' )
  }
}

export const listUnclaimedVaults = async ( userId: string ): Promise< VaultChoice > => {
  requireUserWithoutVault( userId )

  const claimed = new Set( listClaimedVaultDirs() )
  const entries = await readdir( config.vaultsPath, { withFileTypes: true } )
  const folders = entries
    .filter( ( entry ) => entry.isDirectory() && !claimed.has( entry.name ) )
    .map( ( { name } ) => name )
    .filter( ( name ) => VaultDir.safeParse( name ).success )

  return { folders: folders.sort() }
}

// A real folder directly in the vaults folder: not a file and not a symlink
const assertPlainVaultFolder = async ( vaultDir: string ): Promise< void > => {
  const notAFolder = new ValidationError( `"${ vaultDir }" is not a folder in the vaults folder` )
  const path = join( config.vaultsPath, vaultDir )

  const info = await lstat( path ).catch( () => undefined )

  if( info === undefined || !info.isDirectory() ) {
    throw notAFolder
  }

  const root = await realpath( config.vaultsPath )

  if( await realpath( path ) !== join( root, vaultDir ) ) {
    throw notAFolder
  }
}

export const claimVault = async ( userId: string, vaultDir: string ): Promise< void > => {
  requireUserWithoutVault( userId )
  await assertPlainVaultFolder( vaultDir )

  bind( userId, vaultDir )
}

export const createVault = async ( userId: string, vaultDir: string ): Promise< void > => {
  requireUserWithoutVault( userId )

  try {
    await mkdir( join( config.vaultsPath, vaultDir ) )
  } catch( error ) {
    if( error instanceof Error && 'code' in error && error.code === 'EEXIST' ) {
      throw new ConflictError( 'That vault is already taken' )
    }

    throw error
  }

  try {
    bind( userId, vaultDir )
  } catch( error ) {
    // Only the empty folder just made; rmdir refuses anything that has files in it
    await rmdir( join( config.vaultsPath, vaultDir ) ).catch( () => undefined )

    throw error
  }
}
