// Packages
import { describe, it, expect } from 'vitest'
import type { gmail_v1 } from '@googleapis/gmail'
// Gmail
import { findOwnerName, scrubMessage } from './scrubMessage.js'

const owner = { email: 'real.person@gmail.com', name: 'Real Person' }

const encode = ( text: string ): string => Buffer.from( text, 'utf8' ).toString( 'base64url' )
const decode = ( data: string | null | undefined ): string => {
  return Buffer.from( data ?? '', 'base64url' ).toString( 'utf8' )
}

const buildMessage = (): gmail_v1.Schema$Message => ( {
  id: 'm1',
  threadId: 't1',
  snippet: 'Hi Real Person, your alert is ready',
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'Delivered-To', value: 'Real.Person@gmail.com' },
      { name: 'To', value: 'Real Person <real.person@gmail.com>' },
      { name: 'Cc', value: '"Real Person" <real.person@gmail.com>, Friend <friend@example.org>' },
      { name: 'Reply-To', value: 'real.person@gmail.com' },
      { name: 'From', value: 'Upwork <donotreply@upwork.com>' },
      { name: 'Subject', value: 'Jobs for Real Person' },
    ],
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: encode( 'Hello Real Person,\nSent to real.person@gmail.com\nnew jobs' ) },
          },
          {
            mimeType: 'text/html',
            body: {
              data: encode(
                '<p>Hello <b>REAL PERSON</b></p><a href="mailto:Real.Person@Gmail.com">me</a>',
              ),
            },
          },
        ],
      },
      {
        mimeType: 'application/pdf',
        filename: 'cv.pdf',
        body: { attachmentId: 'a1', size: 10 },
      },
    ],
  },
} )

describe( 'scrubMessage', () => {
  it( 'replaces the address and the name in the headers', () => {
    const headers = scrubMessage( buildMessage(), owner ).payload?.headers ?? []
    const value = ( name: string ): string | null | undefined => {
      return headers.find( ( header ) => header.name === name )?.value
    }

    expect( value( 'Delivered-To' ) ).toBe( 'naresh@example.com' )
    expect( value( 'To' ) ).toBe( 'Naresh <naresh@example.com>' )
    expect( value( 'Cc' ) ).toBe( '"Naresh" <naresh@example.com>, Friend <friend@example.org>' )
    expect( value( 'Reply-To' ) ).toBe( 'naresh@example.com' )
    expect( value( 'Subject' ) ).toBe( 'Jobs for Naresh' )
  } )

  it( 'leaves other senders alone', () => {
    const headers = scrubMessage( buildMessage(), owner ).payload?.headers ?? []

    expect( headers.find( ( { name } ) => name === 'From' )?.value )
      .toBe( 'Upwork <donotreply@upwork.com>' )
  } )

  it( 'replaces them in plain and HTML bodies, case-insensitively, and re-encodes', () => {
    const [ alternative ] = scrubMessage( buildMessage(), owner ).payload?.parts ?? []
    const [ plain, html ] = alternative?.parts ?? []

    expect( decode( plain?.body?.data ) )
      .toBe( 'Hello Naresh,\nSent to naresh@example.com\nnew jobs' )
    expect( decode( html?.body?.data ) )
      .toBe( '<p>Hello <b>Naresh</b></p><a href="mailto:naresh@example.com">me</a>' )
    expect( plain?.body?.data ).toMatch( /^[A-Za-z0-9_-]+$/ )
  } )

  it( 'replaces them in the snippet', () => {
    expect( scrubMessage( buildMessage(), owner ).snippet )
      .toBe( 'Hi Naresh, your alert is ready' )
  } )

  it( 'leaves attachments untouched', () => {
    const attachment = scrubMessage( buildMessage(), owner ).payload?.parts?.[ 1 ]

    expect( attachment ).toEqual( buildMessage().payload?.parts?.[ 1 ] )
  } )

  it( 'leaves a body that does not mention the owner byte for byte', () => {
    const latin1 = Buffer.from( 'caf\xe9 au lait', 'latin1' ).toString( 'base64url' )
    const message: gmail_v1.Schema$Message = {
      payload: { mimeType: 'text/plain', headers: [], body: { data: latin1 } },
    }

    expect( scrubMessage( message, owner ).payload?.body?.data ).toBe( latin1 )
  } )

  it( 'scrubs a single-part message body', () => {
    const message: gmail_v1.Schema$Message = {
      payload: {
        mimeType: 'text/plain',
        headers: [],
        body: { data: encode( 'To real.person@gmail.com' ) },
      },
    }

    expect( decode( scrubMessage( message, owner ).payload?.body?.data ) )
      .toBe( 'To naresh@example.com' )
  } )

  it( 'does not turn the placeholder address into a name when the name is "naresh"', () => {
    const message: gmail_v1.Schema$Message = {
      snippet: 'naresh wrote from naresh.k@gmail.com',
    }

    expect( scrubMessage( message, { email: 'naresh.k@gmail.com', name: 'naresh' } ).snippet )
      .toBe( 'Naresh wrote from naresh@example.com' )
  } )

  it( 'does not change the original message', () => {
    const message = buildMessage()
    const before = structuredClone( message )

    scrubMessage( message, owner )

    expect( message ).toEqual( before )
  } )
} )

describe( 'scrubMessage without a name', () => {
  it( 'replaces only the address', () => {
    const message: gmail_v1.Schema$Message = { snippet: 'Hello real.person@gmail.com and everyone' }

    expect( scrubMessage( message, { email: owner.email, name: '' } ).snippet )
      .toBe( 'Hello naresh@example.com and everyone' )
  } )
} )

describe( 'findOwnerName', () => {
  it( 'reads the display name next to the owner address in the To header', () => {
    expect( findOwnerName( buildMessage(), owner.email ) ).toBe( 'Real Person' )
  } )

  it( 'reads a quoted display name from the Cc header', () => {
    const message: gmail_v1.Schema$Message = {
      payload: {
        headers: [
          { name: 'To', value: 'Friend <friend@example.org>' },
          { name: 'Cc', value: '"Real Person" <REAL.PERSON@gmail.com>' },
        ],
      },
    }

    expect( findOwnerName( message, owner.email ) ).toBe( 'Real Person' )
  } )

  it( 'is empty when the address has no display name or is not found', () => {
    const bare: gmail_v1.Schema$Message = {
      payload: { headers: [ { name: 'To', value: 'real.person@gmail.com' } ] },
    }

    expect( findOwnerName( bare, owner.email ) ).toBe( '' )
    expect( findOwnerName( {}, owner.email ) ).toBe( '' )
  } )
} )
