import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECALL_NOTE } from './fixtures.mjs'

const vault = process.argv[ 2 ]

if( !vault ) {
  process.stderr.write( 'usage: node seedVault.mjs <vault folder>\n' )
  process.exit( 1 )
}

const folder = join( vault, 'Learning', 'E2E' )

mkdirSync( folder, { recursive: true } )
writeFileSync( join( folder, 'Recall.md' ), RECALL_NOTE )
