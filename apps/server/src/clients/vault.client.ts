// Node
import {
  access,
  constants,
  mkdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  join,
  resolve,
  sep,
} from 'node:path'
// Shared
import { noteBasename, parseFolderPath } from '@mnemosyne/shared'
// Errors
import { ValidationError } from '../errors.js'

const NOTES_FOLDER = 'Mnemosyne'
const MAX_ATTEMPTS = 1000

const isInside = ( root: string, candidate: string ): boolean => {
  return candidate === root || candidate.startsWith( `${ root }${ sep }` )
}

const realpathOfNearestAncestor = async ( path: string ): Promise< string > => {
  try {
    return await realpath( path )
  } catch( error ) {
    const isMissing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    const parent = dirname( path )

    if( !isMissing || parent === path ) {
      throw error
    }

    return realpathOfNearestAncestor( parent )
  }
}

export const resolveFolder = async (
  vaultPath: string,
  relativeFolder: string,
): Promise< string > => {
  let segments: string[]

  try {
    segments = parseFolderPath( relativeFolder )
  } catch( error ) {
    throw new ValidationError( error instanceof Error ? error.message : 'Invalid folder' )
  }

  const root = await realpath( vaultPath )
  const target = resolve( root, ...segments )
  const outside = new ValidationError( `Folder "${ relativeFolder }" is outside the vault` )

  if( !isInside( root, await realpathOfNearestAncestor( target ) ) ) {
    throw outside
  }

  await mkdir( target, { recursive: true } )

  const created = await realpath( target )

  if( !isInside( root, created ) ) {
    throw outside
  }

  return created
}

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
