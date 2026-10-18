// Packages
import {
  Document,
  Scalar,
  YAMLSeq,
  isMap,
  parse,
} from 'yaml'
import { z } from 'zod'
// Clock
import { formatClock } from './clock.js'
// Source
import type { SourceDocument } from './source.js'
// Tags
import { normalizeTag } from './tags.js'

export const NoteProperties = z.object( {
  title: z.string(),
  source: z.string(),
  channel: z.string().optional(),
  duration: z.string().optional(),
  author: z.string().optional(),
  site: z.string().optional(),
  published: z.string().optional(),
  created: z.string(),
  tags: z.array( z.string() ),
} )
export type NoteProperties = z.infer< typeof NoteProperties >

export type ParsedNote = { properties: NoteProperties, body: string }

export class NoteParseError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'NoteParseError'
  }
}

const OPENING = '---\n'
const CLOSING = '\n---\n'

export const parseNote = ( markdown: string ): ParsedNote => {
  if( !markdown.startsWith( OPENING ) ) {
    throw new NoteParseError( 'the note has no front-matter' )
  }

  const closingAt = markdown.indexOf( CLOSING, OPENING.length - 1 )

  if( closingAt === -1 ) {
    throw new NoteParseError( 'the front-matter is not closed with ---' )
  }

  let data: unknown

  try {
    data = parse( markdown.slice( OPENING.length, closingAt + 1 ) )
  } catch( error ) {
    throw new NoteParseError( error instanceof Error ? error.message : 'invalid YAML' )
  }

  const properties = NoteProperties.safeParse( data )

  if( !properties.success ) {
    const names = new Set( properties.error.issues.map( ( issue ) => issue.path.join( '.' ) ) )

    throw new NoteParseError(
      `missing or invalid properties: ${ [ ...names ].join( ', ' ) }`,
    )
  }

  const rest = markdown.slice( closingAt + CLOSING.length )

  return {
    properties: properties.data,
    body: rest.startsWith( '\n' ) ? rest.slice( 1 ) : rest,
  }
}

const singleLine = ( value: string ): string => value.replace( /\r?\n|\r/g, ' ' )

export const serializeNote = ( { properties, body }: ParsedNote ): string => {
  const { channel, duration, author, site, published } = properties
  const optional = ( value: string | undefined ): string | undefined => {
    return value === undefined ? undefined : singleLine( value )
  }

  const data: Record< string, unknown > = {
    title: singleLine( properties.title ),
    source: singleLine( properties.source ),
    channel: optional( channel ),
    duration: optional( duration ),
    author: optional( author ),
    site: optional( site ),
    published: optional( published ),
    created: properties.created,
    tags: properties.tags,
  }

  const document = new Document( Object.fromEntries(
    Object.entries( data ).filter( ( [ , value ] ) => value !== undefined ),
  ) )

  if( isMap( document.contents ) ) {
    for( const pair of document.contents.items ) {
      const isCreated = pair.key instanceof Scalar && pair.key.value === 'created'

      if( pair.value instanceof Scalar && !isCreated ) {
        pair.value.type = 'QUOTE_DOUBLE'
      }

      if( pair.value instanceof YAMLSeq ) {
        pair.value.flow = true
      }
    }
  }

  const frontmatter = document.toString( { lineWidth: 0, flowCollectionPadding: false } )

  return `${ OPENING }${ frontmatter }---\n\n${ body }`
}

const LOCKED_KEYS: readonly string[] = [
  'source',
  'channel',
  'duration',
  'author',
  'site',
  'published',
  'created',
]

export type LockedProperties =
  Pick< NoteProperties, 'source' | 'created' >
  & Pick< Partial< NoteProperties >, 'channel' | 'duration' | 'author' | 'site' | 'published' >

export const lockedPropertiesFor = (
  document: SourceDocument,
  created: string,
): LockedProperties => {
  if( document.kind === 'video' ) {
    const { source, channel, duration_seconds } = document.meta

    return { source, channel, duration: formatClock( duration_seconds ), created }
  }

  const { source, author, site, published } = document.meta

  return {
    source,
    ...author === null ? {} : { author },
    ...site === null ? {} : { site },
    ...published === null ? {} : { published },
    created,
  }
}

const FIXED_TAG = 'mnemosyne'

export const applyLockedProperties = (
  { properties, body }: ParsedNote,
  locked: LockedProperties,
): ParsedNote => {
  const tags = properties.tags
    .map( normalizeTag )
    .filter( ( tag ) => tag !== '' && tag !== FIXED_TAG )

  const kept = Object.fromEntries(
    Object.entries( properties ).filter(
      ( [ key ] ) => !LOCKED_KEYS.includes( key ),
    ),
  ) as Pick< NoteProperties, 'title' >

  return {
    properties: {
      ...kept,
      ...locked,
      tags: [ ...new Set( [ FIXED_TAG, ...tags ] ) ],
    },
    body,
  }
}
