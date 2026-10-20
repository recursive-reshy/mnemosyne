// Node
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Packages
import type { gmail_v1 } from '@googleapis/gmail'
// Gmail
import { stripFixture } from '#src/gmail/stripFixture.js'

// One-off: cleans the fixtures saved before `fixture:gmail` stripped them itself. Running it
// again changes nothing.
const folder = fileURLToPath( new URL( '../src/test-support/gmail/', import.meta.url ) )

for( const file of ( await readdir( folder ) ).filter( ( name ) => name.endsWith( '.json' ) ) ) {
  const path = join( folder, file )
  const message = JSON.parse( await readFile( path, 'utf8' ) ) as gmail_v1.Schema$Message
  const stripped = stripFixture( message, basename( file, '.json' ) )

  await writeFile( path, `${ JSON.stringify( stripped, null, 2 ) }\n` )
  console.log( `Stripped ${ file }` )
}
