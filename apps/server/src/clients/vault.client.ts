// Node
import {
  access,
  constants,
  mkdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
// Shared
import { noteBasename } from '@mnemosyne/shared'

const NOTES_FOLDER = 'Mnemosyne'
const MAX_ATTEMPTS = 1000

export const writeNote = async (
  vaultPath: string,
  title: string,
  content: string,
): Promise< string > => {
  await mkdir( join( vaultPath, NOTES_FOLDER ), { recursive: true } )

  const basename = noteBasename( title )

  for( let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1 ) {
    const name = attempt === 1 ? basename : `${ basename } (${ attempt })`
    const relativePath = `${ NOTES_FOLDER }/${ name }.md`

    try {
      await writeFile( join( vaultPath, relativePath ), content, { flag: 'wx' } )

      return relativePath
    } catch( error ) {
      const isClash = error instanceof Error && 'code' in error && error.code === 'EEXIST'

      if( !isClash ) {
        throw error
      }
    }
  }

  throw new Error( `Could not find a free file name for "${ basename }" in the vault` )
}

export const assertVaultWritable = async ( vaultPath: string ): Promise< void > => {
  let isFolder: boolean

  try {
    isFolder = ( await stat( vaultPath ) ).isDirectory()
  } catch( error ) {
    throw new Error(
      `VAULT_PATH ${ vaultPath } does not exist or cannot be read. `
      + 'Mount the vault folder there (VAULT_HOST_PATH in Docker).',
      { cause: error },
    )
  }

  if( !isFolder ) {
    throw new Error( `VAULT_PATH ${ vaultPath } is not a folder` )
  }

  try {
    await access( vaultPath, constants.W_OK )
  } catch( error ) {
    throw new Error( `VAULT_PATH ${ vaultPath } is not writable`, { cause: error } )
  }
}
