// Packages
import type { gmail_v1 } from '@googleapis/gmail'

export interface ParsedMessage {
  messageId: string
  subject: string
  sender: string
  senderAddress: string
  receivedAt: string
  html: string | null
  text: string | null
  listUnsubscribe: boolean
}

type Part = gmail_v1.Schema$MessagePart

const NO_SUBJECT = '(no subject)'
const ENCODED_WORD = /=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi
const BETWEEN_ENCODED_WORDS = /(=\?[^?\s]+\?[bq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bq]\?)/gi
const FROM_WITH_ADDRESS = /^\s*(?:"((?:[^"\\]|\\.)*)"|([^<]*?))\s*<([^>]+)>\s*$/

// An unknown charset name is the sender's mistake; read the bytes as UTF-8 instead of failing.
const decodeBytes = ( bytes: Uint8Array, charset: string | undefined ): string => {
  try {
    return new TextDecoder( charset ?? 'utf-8' ).decode( bytes )
  } catch{
    return new TextDecoder( 'utf-8' ).decode( bytes )
  }
}

const decodeQuotedPrintable = ( text: string ): Buffer => {
  const bytes: number[] = []

  for( let index = 0; index < text.length; index += 1 ) {
    const char = text.charAt( index )
    const hex = text.slice( index + 1, index + 3 )

    if( char === '_' ) {
      bytes.push( 0x20 )
    } else if( char === '=' && /^[0-9a-f]{2}$/i.test( hex ) ) {
      bytes.push( parseInt( hex, 16 ) )
      index += 2
    } else {
      bytes.push( ...Buffer.from( char ) )
    }
  }

  return Buffer.from( bytes )
}

// RFC 2047: =?charset?B|Q?text?=. Whitespace between two encoded words is not part of the text.
const decodeEncodedWords = ( value: string ): string => {
  return value
    .replace( BETWEEN_ENCODED_WORDS, '$1' )
    .replace( ENCODED_WORD, ( _word, charset: string, encoding: string, text: string ) => {
      const bytes = encoding.toLowerCase() === 'b'
        ? Buffer.from( text, 'base64' )
        : decodeQuotedPrintable( text )

      // A charset may carry a language tag, as in utf-8*en.
      return decodeBytes( bytes, charset.split( '*' )[ 0 ] )
    } )
}

type Header = gmail_v1.Schema$MessagePartHeader

const findHeader = ( headers: Header[], name: string ): string | undefined => {
  return headers.find( ( header ) => header.name?.toLowerCase() === name )?.value ?? undefined
}

const splitFrom = ( from: string ): { sender: string, senderAddress: string } => {
  const match = FROM_WITH_ADDRESS.exec( from )

  if( match === null ) {
    const address = from.trim()

    return { sender: address, senderAddress: address }
  }

  const [ , quoted, bare, address = '' ] = match
  const name = decodeEncodedWords( ( quoted ?? bare ?? '' ).replace( /\\(.)/g, '$1' ) ).trim()

  return { sender: name === '' ? address.trim() : name, senderAddress: address.trim() }
}

const isAttachment = ( part: Part ): boolean => {
  const disposition = findHeader( part.headers ?? [], 'content-disposition' )

  return !!part.filename || /^\s*attachment/i.test( disposition ?? '' )
}

const readBody = ( part: Part ): string | null => {
  const data = part.body?.data

  if( !data ) {
    return null
  }

  const contentType = findHeader( part.headers ?? [], 'content-type' ) ?? ''
  const charset = /charset\s*=\s*"?([^";\s]+)"?/i.exec( contentType )?.[ 1 ]

  return decodeBytes( Buffer.from( data, 'base64url' ), charset )
}

const collectBodies = (
  part: Part,
  found: { html: string | null, text: string | null },
): void => {
  if( isAttachment( part ) ) {
    return
  }

  if( part.mimeType === 'text/html' && found.html === null ) {
    found.html = readBody( part )
  } else if( part.mimeType === 'text/plain' && found.text === null ) {
    found.text = readBody( part )
  }

  ( part.parts ?? [] ).forEach( ( child ) => collectBodies( child, found ) )
}

export const parseMessage = ( message: gmail_v1.Schema$Message ): ParsedMessage => {
  if( !message.id ) {
    throw new Error( 'Gmail message has no id' )
  }

  if( !message.internalDate ) {
    throw new Error( `Gmail message ${ message.id } has no internalDate` )
  }

  const payload = message.payload ?? {}
  const headers = payload.headers ?? []
  const subject = decodeEncodedWords( findHeader( headers, 'subject' ) ?? '' ).trim()
  const bodies = { html: null, text: null }

  collectBodies( payload, bodies )

  return {
    messageId: message.id,
    subject: subject === '' ? NO_SUBJECT : subject,
    ...splitFrom( findHeader( headers, 'from' ) ?? '' ),
    receivedAt: new Date( Number( message.internalDate ) ).toISOString(),
    ...bodies,
    listUnsubscribe: findHeader( headers, 'list-unsubscribe' ) !== undefined,
  }
}
