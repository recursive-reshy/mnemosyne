// Packages
import type { gmail_v1 } from '@googleapis/gmail'

const PLACEHOLDER_EMAIL = 'naresh@example.com'
const PLACEHOLDER_NAME = 'Naresh'
const EMAIL_MARK = '\u0000email\u0000'
const NAME_MARK = '\u0000name\u0000'

type Owner = { email: string, name: string }

const escapeRegExp = ( text: string ): string => text.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' )

const buildScrubber = ( { email, name }: Owner ) => {
  const emailPattern = new RegExp( escapeRegExp( email ), 'gi' )
  const namePattern = name === '' ? null : new RegExp( escapeRegExp( name ), 'gi' )
  const anyPattern = new RegExp(
    [ emailPattern.source, namePattern?.source ].filter( Boolean ).join( '|' ),
    'i',
  )

  return {
    mentionsOwner: ( text: string ): boolean => anyPattern.test( text ),
    scrub: ( text: string ): string => text
      .replace( emailPattern, EMAIL_MARK )
      .replace( namePattern ?? /(?!)/g, NAME_MARK )
      .replaceAll( EMAIL_MARK, PLACEHOLDER_EMAIL )
      .replaceAll( NAME_MARK, PLACEHOLDER_NAME ),
  }
}

export const scrubMessage = (
  message: gmail_v1.Schema$Message,
  owner: Owner,
): gmail_v1.Schema$Message => {
  const { mentionsOwner, scrub } = buildScrubber( owner )

  const scrubPart = ( part: gmail_v1.Schema$MessagePart ): gmail_v1.Schema$MessagePart => {
    const copy = { ...part }

    if( part.headers ) {
      copy.headers = part.headers.map( ( header ) => ( {
        ...header,
        value: typeof header.value === 'string' ? scrub( header.value ) : header.value,
      } ) )
    }

    // A body that never mentions the owner keeps its original bytes (it may not be UTF-8).
    if( part.body?.data && !part.filename && part.mimeType?.startsWith( 'text/' ) ) {
      const text = Buffer.from( part.body.data, 'base64url' ).toString( 'utf8' )

      if( mentionsOwner( text ) ) {
        const data = Buffer.from( scrub( text ), 'utf8' ).toString( 'base64url' )

        copy.body = { ...part.body, data }
      }
    }

    if( part.parts ) {
      copy.parts = part.parts.map( scrubPart )
    }

    return copy
  }

  const copy = { ...message }

  if( message.snippet ) {
    copy.snippet = scrub( message.snippet )
  }

  if( message.payload ) {
    copy.payload = scrubPart( message.payload )
  }

  return copy
}

export const findOwnerName = ( message: gmail_v1.Schema$Message, email: string ): string => {
  const pattern = new RegExp( `"?([^"<>,]+?)"?\\s*<${ escapeRegExp( email ) }>`, 'i' )

  for( const { name, value } of message.payload?.headers ?? [] ) {
    if( name && [ 'to', 'cc', 'delivered-to' ].includes( name.toLowerCase() ) ) {
      const found = pattern.exec( value ?? '' )?.[ 1 ]?.trim()

      if( found ) {
        return found
      }
    }
  }

  return ''
}
