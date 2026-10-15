// Shared
import { TranscriptMeta } from '@mnemosyne/shared'
// Formatters
import { quoted } from './frontmatter.js'
import { normalizeTag } from './summary.cleanup.js'
import { formatClock } from './timestamps.js'

interface NoteInput {
  title: string
  tags: string[]
  body: string
  meta: TranscriptMeta
  created: string
}

const FIXED_TAG = 'mnemosyne'

export const formatNote = ( { title, tags, body, meta, created }: NoteInput ): string => {
  const cleanedTags = tags
    .map( normalizeTag )
    .filter( ( tag ) => tag !== '' && tag !== FIXED_TAG )
  const allTags = [ ...new Set( [ FIXED_TAG, ...cleanedTags ] ) ]

  const frontmatter = [
    '---',
    `title: ${ quoted( title ) }`,
    `source: ${ quoted( meta.source ) }`,
    `channel: ${ quoted( meta.channel ) }`,
    `duration: ${ quoted( formatClock( meta.duration_seconds ) ) }`,
    `created: ${ created }`,
    `tags: [${ allTags.join( ', ' ) }]`,
    '---',
  ].join( '\n' )

  return `${ frontmatter }\n\n${ body.trim() }\n`
}
