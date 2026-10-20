// Packages
import type { gmail_v1 } from '@googleapis/gmail'

// What `parseMessage` and the tests read. Everything else in a saved message (routing, DKIM,
// the sender's per-subscriber ids) says more about the mailbox than the fixture needs.
const KEPT_HEADERS = [
  'subject',
  'from',
  'to',
  'date',
  'mime-version',
  'content-type',
  'list-unsubscribe',
]
const URL_PATTERN = /(https?:\/\/[^/?#\s"'<>)\]]+)([^\s"'<>)\]]*)/g
// Footer detection looks at link URLs too, so these path words survive.
const FOOTER_WORD = /unsubscribe|preferences|subscription/i

type Part = gmail_v1.Schema$MessagePart
type Header = gmail_v1.Schema$MessagePartHeader

// A link's path and query can carry a per-subscriber token; the host and the text stay.
const reduceUrls = ( text: string, forcedPath?: string ): string => {
  return text.replace( URL_PATTERN, ( _match, origin: string, rest: string ) => {
    if( rest === '' ) {
      return origin
    }

    const word = FOOTER_WORD.exec( rest )?.[ 0 ]

    return `${ origin }${ forcedPath ?? `/${ word?.toLowerCase() ?? 'x' }` }`
  } )
}

const isUtf8 = ( part: Part ): boolean => {
  const contentType = part.headers
    ?.find( ( { name } ) => name?.toLowerCase() === 'content-type' )?.value ?? ''
  const charset = /charset\s*=\s*"?([^";\s]+)"?/i.exec( contentType )?.[ 1 ]?.toLowerCase()

  return charset === undefined || charset === 'utf-8' || charset === 'us-ascii'
}

const stripHeaders = ( headers: Header[] | undefined ): Header[] | undefined => {
  return headers
    ?.filter( ( { name } ) => KEPT_HEADERS.includes( name?.toLowerCase() ?? '' ) )
    .map( ( header ) => {
      const isUnsubscribe = header.name?.toLowerCase() === 'list-unsubscribe'

      return typeof header.value === 'string' && isUnsubscribe
        ? { ...header, value: reduceUrls( header.value, '/unsubscribe' ) }
        : header
    } )
}

const stripPart = ( part: Part ): Part => {
  const copy: Part = { ...part }

  if( part.headers ) {
    copy.headers = stripHeaders( part.headers ) ?? []
  }

  // A body that isn't UTF-8 keeps its bytes; the fixtures that need a charset test keep it.
  const isText = !part.filename && part.mimeType?.startsWith( 'text/' ) && isUtf8( part )

  if( part.body?.data && isText ) {
    const text = Buffer.from( part.body.data, 'base64url' ).toString( 'utf8' )
    const data = Buffer.from( reduceUrls( text ), 'utf8' ).toString( 'base64url' )

    copy.body = { ...part.body, data }
  }

  if( part.parts ) {
    copy.parts = part.parts.map( stripPart )
  }

  return copy
}

export const stripFixture = (
  message: gmail_v1.Schema$Message,
  name: string,
): gmail_v1.Schema$Message => {
  const stripped: gmail_v1.Schema$Message = { id: name }

  if( message.internalDate ) {
    stripped.internalDate = message.internalDate
  }

  if( message.payload ) {
    stripped.payload = stripPart( message.payload )
  }

  return stripped
}
