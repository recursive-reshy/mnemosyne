// Node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The nearest package.json above this file: src/ in development, dist/src/ in production.
const findVersion = (): string => {
  let directory = dirname( fileURLToPath( import.meta.url ) )

  for( let depth = 0; depth < 4; depth += 1 ) {
    const file = join( directory, 'package.json' )

    if( existsSync( file ) ) {
      const { version } = JSON.parse( readFileSync( file, 'utf8' ) ) as { version?: unknown }

      return typeof version === 'string' ? version : 'dev'
    }

    directory = dirname( directory )
  }

  return 'dev'
}

export const appVersion: string = findVersion()
