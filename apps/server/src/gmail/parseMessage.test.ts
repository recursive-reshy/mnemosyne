// Packages
import { describe, it, expect } from 'vitest'
import type { gmail_v1 } from '@googleapis/gmail'
// Gmail
import { parseMessage } from './parseMessage.js'

type Part = gmail_v1.Schema$MessagePart

const encode = ( text: string | Buffer ): string => {
  return Buffer.from( text ).toString( 'base64url' )
}

const header = ( name: string, value: string ): { name: string, value: string } => {
  return { name, value }
}

const bodyPart = (
  mimeType: string,
  content: string | Buffer,
  { charset, filename, disposition }: {
    charset?: string
    filename?: string
    disposition?: string
  } = {},
): Part => {
  const contentType = charset === undefined ? mimeType : `${ mimeType }; charset="${ charset }"`
  const headers = [ header( 'Content-Type', contentType ) ]

  if( disposition !== undefined ) {
    headers.push( header( 'Content-Disposition', disposition ) )
  }

  return {
    mimeType,
    filename: filename ?? '',
    headers,
    body: { size: content.length, data: encode( content ) },
  }
}

const container = ( mimeType: string, parts: Part[] ): Part => {
  return { mimeType, filename: '', headers: [ header( 'Content-Type', mimeType ) ], parts }
}

const message = (
  payload: Part,
  headers: { name: string, value: string }[] = [],
  internalDate: string | null = '1792000000000',
): gmail_v1.Schema$Message => {
  return {
    id: 'msg-1',
    internalDate: internalDate ?? undefined,
    payload: {
      ...payload,
      headers: [
        ...payload.headers ?? [],
        header( 'Subject', 'Hello' ),
        header( 'From', 'Ada <ada@example.com>' ),
        ...headers,
      ],
    },
  }
}

const textOf = ( content: string | Buffer, charset: string ): string | null => {
  return parseMessage( message( bodyPart( 'text/plain', content, { charset } ) ) ).text
}

describe( 'parseMessage: bodies', () => {
  it( 'reads a plain text message', () => {
    const parsed = parseMessage( message( bodyPart( 'text/plain', 'Just text' ) ) )

    expect( parsed.text ).toBe( 'Just text' )
    expect( parsed.html ).toBeNull()
    expect( parsed.messageId ).toBe( 'msg-1' )
  } )

  it( 'reads a plain text message that has no parts or content type header', () => {
    const payload: Part = {
      mimeType: 'text/plain',
      body: { data: encode( 'Bare' ) },
    }

    expect( parseMessage( message( payload ) ).text ).toBe( 'Bare' )
  } )

  it( 'reads both bodies of multipart/alternative', () => {
    const parsed = parseMessage( message( container( 'multipart/alternative', [
      bodyPart( 'text/plain', 'Plain version' ),
      bodyPart( 'text/html', '<p>Html version</p>' ),
    ] ) ) )

    expect( parsed.text ).toBe( 'Plain version' )
    expect( parsed.html ).toBe( '<p>Html version</p>' )
  } )

  it( 'finds bodies nested in mixed > related > alternative', () => {
    const parsed = parseMessage( message( container( 'multipart/mixed', [
      container( 'multipart/related', [
        container( 'multipart/alternative', [
          bodyPart( 'text/plain', 'Deep plain' ),
          bodyPart( 'text/html', '<b>Deep html</b>' ),
        ] ),
        bodyPart( 'image/png', 'png-bytes', { filename: '' } ),
      ] ),
    ] ) ) )

    expect( parsed.text ).toBe( 'Deep plain' )
    expect( parsed.html ).toBe( '<b>Deep html</b>' )
  } )

  it( 'takes the first of each type, depth first', () => {
    const parsed = parseMessage( message( container( 'multipart/mixed', [
      container( 'multipart/alternative', [
        bodyPart( 'text/html', '<p>first</p>' ),
      ] ),
      bodyPart( 'text/html', '<p>second</p>' ),
      bodyPart( 'text/plain', 'plain' ),
    ] ) ) )

    expect( parsed.html ).toBe( '<p>first</p>' )
    expect( parsed.text ).toBe( 'plain' )
  } )

  it( 'skips an attachment with a filename', () => {
    const parsed = parseMessage( message( container( 'multipart/mixed', [
      bodyPart( 'text/plain', 'attached notes', { filename: 'notes.txt' } ),
      bodyPart( 'text/plain', 'real body' ),
    ] ) ) )

    expect( parsed.text ).toBe( 'real body' )
  } )

  it( 'skips a part marked as an attachment even without a filename', () => {
    const parsed = parseMessage( message( container( 'multipart/mixed', [
      bodyPart( 'text/html', '<p>attached</p>', { disposition: 'attachment' } ),
      bodyPart( 'text/html', '<p>real</p>' ),
    ] ) ) )

    expect( parsed.html ).toBe( '<p>real</p>' )
  } )

  it( 'does not read a body that is only an attachment', () => {
    const parsed = parseMessage( message( container( 'multipart/mixed', [
      bodyPart( 'text/html', '<p>attached</p>', { filename: 'page.html' } ),
    ] ) ) )

    expect( parsed.html ).toBeNull()
    expect( parsed.text ).toBeNull()
  } )

  it( 'leaves both bodies null when the message has none', () => {
    const parsed = parseMessage( message( container( 'multipart/mixed', [
      { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'x', size: 5 } },
    ] ) ) )

    expect( parsed.html ).toBeNull()
    expect( parsed.text ).toBeNull()
  } )

  it( 'decodes UTF-8 by default', () => {
    expect( parseMessage( message( bodyPart( 'text/plain', 'Café – 日本' ) ) ).text )
      .toBe( 'Café – 日本' )
  } )

  it( 'decodes ISO-8859-1 by the part charset', () => {
    const bytes = Buffer.from( [ 0x43, 0x61, 0x66, 0xe9 ] )

    expect( textOf( bytes, 'ISO-8859-1' ) ).toBe( 'Café' )
  } )

  it( 'decodes Windows-1252 by the part charset', () => {
    const bytes = Buffer.from( [ 0x93, 0x68, 0x69, 0x94 ] )

    expect( textOf( bytes, 'windows-1252' ) ).toBe( '“hi”' )
  } )

  it( 'decodes Shift_JIS by the part charset', () => {
    const bytes = Buffer.from( [ 0x93, 0xfa, 0x96, 0x7b ] )

    expect( textOf( bytes, 'Shift_JIS' ) ).toBe( '日本' )
  } )

  it( 'falls back to UTF-8 for a charset it does not know', () => {
    expect( textOf( 'plain', 'x-nonsense' ) ).toBe( 'plain' )
  } )
} )

describe( 'parseMessage: headers', () => {
  const plain = bodyPart( 'text/plain', 'x' )

  it( 'reads the subject', () => {
    expect( parseMessage( message( plain ) ).subject ).toBe( 'Hello' )
  } )

  it( 'finds headers whatever their case', () => {
    const payload: Part = { ...plain, headers: [
      header( 'sUbJeCt', 'Mixed case' ),
      header( 'FROM', 'Ada <ada@example.com>' ),
      header( 'list-unsubscribe', '<mailto:u@example.com>' ),
    ] }
    const parsed = parseMessage( { id: 'm', internalDate: '1792000000000', payload } )

    expect( parsed.subject ).toBe( 'Mixed case' )
    expect( parsed.sender ).toBe( 'Ada' )
    expect( parsed.listUnsubscribe ).toBe( true )
  } )

  it( 'uses "(no subject)" when there is none or it is blank', () => {
    const base = { id: 'm', internalDate: '1792000000000' }

    expect( parseMessage( { ...base, payload: { ...plain, headers: [] } } ).subject )
      .toBe( '(no subject)' )
    expect( parseMessage( {
      ...base,
      payload: { ...plain, headers: [ header( 'Subject', '   ' ) ] },
    } ).subject ).toBe( '(no subject)' )
  } )

  it( 'decodes a UTF-8 Base64 encoded word', () => {
    const subject = `=?UTF-8?B?${ Buffer.from( 'Café ☕' ).toString( 'base64' ) }?=`
    const payload: Part = { ...plain, headers: [ header( 'Subject', subject ) ] }

    expect( parseMessage( { id: 'm', internalDate: '1792000000000', payload } ).subject )
      .toBe( 'Café ☕' )
  } )

  it( 'decodes a Q encoded word with underscores and hex escapes', () => {
    const payload: Part = { ...plain, headers: [
      header( 'Subject', '=?UTF-8?Q?Caf=C3=A9_au_lait?=' ),
    ] }

    expect( parseMessage( { id: 'm', internalDate: '1792000000000', payload } ).subject )
      .toBe( 'Café au lait' )
  } )

  it( 'decodes an ISO-8859-1 encoded word', () => {
    const payload: Part = { ...plain, headers: [ header( 'Subject', '=?ISO-8859-1?Q?Caf=E9?=' ) ] }

    expect( parseMessage( { id: 'm', internalDate: '1792000000000', payload } ).subject )
      .toBe( 'Café' )
  } )

  it( 'joins adjacent encoded words and keeps the text around them', () => {
    const payload: Part = { ...plain, headers: [
      header( 'Subject', 'Re: =?UTF-8?Q?Caf=C3=A9?= =?UTF-8?Q?_et_th=C3=A9?= done' ),
    ] }

    expect( parseMessage( { id: 'm', internalDate: '1792000000000', payload } ).subject )
      .toBe( 'Re: Café et thé done' )
  } )

  it( 'decodes an encoded display name in From', () => {
    const payload: Part = { ...plain, headers: [
      header( 'From', '=?UTF-8?Q?Ren=C3=A9e_Dupont?= <renee@example.com>' ),
    ] }
    const parsed = parseMessage( { id: 'm', internalDate: '1792000000000', payload } )

    expect( parsed.sender ).toBe( 'Renée Dupont' )
    expect( parsed.senderAddress ).toBe( 'renee@example.com' )
  } )

  it.each( [
    [ '"Ada Lovelace" <ada@example.com>', 'Ada Lovelace', 'ada@example.com' ],
    [ 'Ada Lovelace <ada@example.com>', 'Ada Lovelace', 'ada@example.com' ],
    [ '"Lovelace, Ada" <ada@example.com>', 'Lovelace, Ada', 'ada@example.com' ],
    [ '<ada@example.com>', 'ada@example.com', 'ada@example.com' ],
    [ 'ada@example.com', 'ada@example.com', 'ada@example.com' ],
  ] )( 'splits From %s', ( from, sender, senderAddress ) => {
    const payload: Part = { ...plain, headers: [ header( 'From', from ) ] }
    const parsed = parseMessage( { id: 'm', internalDate: '1792000000000', payload } )

    expect( parsed.sender ).toBe( sender )
    expect( parsed.senderAddress ).toBe( senderAddress )
  } )

  it( 'reports whether List-Unsubscribe is present', () => {
    expect( parseMessage( message( plain ) ).listUnsubscribe ).toBe( false )
    expect( parseMessage( message( plain, [
      header( 'List-Unsubscribe', '<https://example.com/u>' ),
    ] ) ).listUnsubscribe ).toBe( true )
  } )

  it( 'takes receivedAt from internalDate', () => {
    expect( parseMessage( message( plain, [], '1792000000000' ) ).receivedAt )
      .toBe( new Date( 1792000000000 ).toISOString() )
  } )

  it( 'throws when the message has no internalDate', () => {
    expect( () => parseMessage( message( plain, [], null ) ) )
      .toThrow( 'Gmail message msg-1 has no internalDate' )
  } )

  it( 'throws when the message has no id', () => {
    expect( () => parseMessage( { internalDate: '1', payload: plain } ) )
      .toThrow( 'Gmail message has no id' )
  } )
} )
