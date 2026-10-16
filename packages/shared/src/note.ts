// Packages
import {
  Document,
  Scalar,
  YAMLSeq,
  isMap,
  parse,
} from 'yaml'
import { z } from 'zod'

export const NoteProperties = z.object( {
  title: z.string(),
  source: z.string(),
  channel: z.string(),
  duration: z.string(),
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
  const document = new Document( {
    title: singleLine( properties.title ),
    source: singleLine( properties.source ),
    channel: singleLine( properties.channel ),
    duration: singleLine( properties.duration ),
    created: properties.created,
    tags: properties.tags,
  } )

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
