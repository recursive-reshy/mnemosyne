// Node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
// Packages
import { describe, it, expect } from 'vitest'

// ADR 0072: the learning root is the one folder created outside the note save, and only by the
// settings service. Melete's scan, generator and review stay read-only.
const SRC = dirname( fileURLToPath( import.meta.url ) )
const ALLOWED = [ 'clients/vault.client.ts', 'services/settings.service.ts' ]

const sources = ( dir: string ): string[] => {
  return readdirSync( dir, { withFileTypes: true } ).flatMap( ( entry ) => {
    const path = join( dir, entry.name )

    if( entry.isDirectory() ) {
      return sources( path )
    }

    return entry.name.endsWith( '.ts' ) && !entry.name.includes( '.test.' ) ? [ path ] : []
  } )
}

describe( 'resolveFolder importers', () => {
  const users = sources( SRC )
    .map( ( path ) => relative( SRC, path ) )
    .filter( ( path ) => /\bresolveFolder\b/.test( readFileSync( join( SRC, path ), 'utf8' ) ) )

  it( 'are the vault client and the settings service only', () => {
    expect( users.sort() ).toEqual( ALLOWED )
  } )

  it( 'never include a Melete module', () => {
    const melete = users.filter( ( path ) => {
      return path.startsWith( 'melete/' ) || /^services\/melete/.test( path )
    } )

    expect( melete ).toEqual( [] )
  } )
} )
