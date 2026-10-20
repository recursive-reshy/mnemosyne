// Packages
import { describe, it, expect } from 'vitest'
import type { gmail_v1 } from '@googleapis/gmail'
// Gmail
import { stripFixture } from './stripFixture.js'

const encode = ( text: string ): string => Buffer.from( text, 'utf8' ).toString( 'base64url' )
const decode = ( data: string | null | undefined ): string => {
  return Buffer.from( data ?? '', 'base64url' ).toString( 'utf8' )
}

const header = ( name: string, value: string ): gmail_v1.Schema$MessagePartHeader => {
  return { name, value }
}

const build = (): gmail_v1.Schema$Message => ( {
  id: '19a1b2c3d4e5f607',
  threadId: '19a1b2c3d4e5f607',
  historyId: '991122',
  labelIds: [ 'INBOX', 'CATEGORY_UPDATES', 'Label_17' ],
  sizeEstimate: 123456,
  snippet: 'A snippet that could say anything',
  internalDate: '1792000000000',
  payload: {
    partId: '',
    mimeType: 'multipart/alternative',
    filename: '',
    headers: [
      header( 'Delivered-To', 'naresh@example.com' ),
      header( 'Received', 'by 2002:a05:6a20 with SMTP id abc; Tue, 20 Oct 2026' ),
      header( 'ARC-Seal', 'i=1; a=rsa-sha256; cv=none' ),
      header( 'DKIM-Signature', 'v=1; a=rsa-sha256; d=news.example.com; s=k1; b=AbCdEf' ),
      header( 'X-EmailOctopus-List-Contact-Id', 'c0ffee00-1111-2222-3333-444455556666' ),
      header( 'X-HS-Cid', '9988776655' ),
      header( 'Feedback-ID', '1:2:3:ses' ),
      header( 'Message-ID', '<abc@news.example.com>' ),
      header( 'Return-Path', '<bounce+secret@news.example.com>' ),
      header( 'Subject', 'This week in tech' ),
      header( 'From', 'The Newsletter <hello@news.example.com>' ),
      header( 'To', 'naresh@example.com' ),
      header( 'Date', 'Tue, 20 Oct 2026 08:00:00 +0000' ),
      header( 'MIME-Version', '1.0' ),
      header( 'Content-Type', 'multipart/alternative; boundary="b1"' ),
      header( 'List-Unsubscribe', '<https://news.example.com/u/abc123?token=SECRET>, <mailto:u@x.com>' ),
    ],
    parts: [
      {
        partId: '0',
        mimeType: 'text/plain',
        filename: '',
        headers: [
          header( 'Content-Type', 'text/plain; charset="UTF-8"' ),
          header( 'X-Part-Secret', 'nope' ),
        ],
        body: {
          size: 90,
          data: encode(
            'Read it online (https://click.news.example.com/ls/click?upn=u001.LONGTOKEN&x=1)\n'
            + 'Unsubscribe: https://click.news.example.com/unsubscribe/abc?t=SECRET\n'
            + 'Plain https://news.example.com/p/post-title',
          ),
        },
      },
      {
        partId: '1',
        mimeType: 'text/html',
        filename: '',
        headers: [ header( 'Content-Type', 'text/html; charset="UTF-8"' ) ],
        body: {
          size: 200,
          data: encode(
            '<p>Hello <a href="https://click.news.example.com/ls/click?upn=u001.LONG&amp;x=1">link text</a></p>'
            + '<a href="https://news.example.com/preferences/me?k=SECRET">Manage preferences</a>'
            + '<img src="https://track.news.example.com/open.gif?u=ABC123" width="1">'
            + '<a href="mailto:hello@news.example.com">mail</a>',
          ),
        },
      },
    ],
  },
} )

const headerNames = ( message: gmail_v1.Schema$Message ): string[] => {
  return ( message.payload?.headers ?? [] ).map( ( { name } ) => name ?? '' )
}

describe( 'stripFixture', () => {
  it( 'keeps only the headers the parser reads, and Content-Type for charsets', () => {
    expect( headerNames( stripFixture( build(), 'newsletter-x' ) ) ).toEqual( [
      'Subject',
      'From',
      'To',
      'Date',
      'MIME-Version',
      'Content-Type',
      'List-Unsubscribe',
    ] )
  } )

  it( 'drops headers on the parts too, keeping their Content-Type', () => {
    const stripped = stripFixture( build(), 'newsletter-x' )

    expect( stripped.payload?.parts?.[ 0 ]?.headers )
      .toEqual( [ header( 'Content-Type', 'text/plain; charset="UTF-8"' ) ] )
  } )

  it( 'matches header names whatever their case', () => {
    const message = build()

    message.payload!.headers = [ header( 'SUBJECT', 'x' ), header( 'x-hs-cid', '1' ) ]

    expect( headerNames( stripFixture( message, 'n' ) ) ).toEqual( [ 'SUBJECT' ] )
  } )

  it( 'names the message after the fixture and drops the mailbox snapshot fields', () => {
    const stripped = stripFixture( build(), 'newsletter-x' )

    expect( stripped.id ).toBe( 'newsletter-x' )
    expect( stripped ).not.toHaveProperty( 'threadId' )
    expect( stripped ).not.toHaveProperty( 'historyId' )
    expect( stripped ).not.toHaveProperty( 'labelIds' )
    expect( stripped ).not.toHaveProperty( 'sizeEstimate' )
    expect( stripped ).not.toHaveProperty( 'snippet' )
  } )

  it( 'keeps the date, the part structure and the mime types', () => {
    const stripped = stripFixture( build(), 'newsletter-x' )

    expect( stripped.internalDate ).toBe( '1792000000000' )
    expect( stripped.payload?.mimeType ).toBe( 'multipart/alternative' )
    expect( stripped.payload?.parts?.map( ( { mimeType } ) => mimeType ) )
      .toEqual( [ 'text/plain', 'text/html' ] )
  } )

  describe( 'links', () => {
    const bodies = ( message: gmail_v1.Schema$Message ): { text: string, html: string } => ( {
      text: decode( message.payload?.parts?.[ 0 ]?.body?.data ),
      html: decode( message.payload?.parts?.[ 1 ]?.body?.data ),
    } )

    it( 'keeps the host and replaces the path and query', () => {
      const { text, html } = bodies( stripFixture( build(), 'n' ) )

      expect( text ).toContain( '(https://click.news.example.com/x)' )
      expect( text ).toContain( 'Plain https://news.example.com/x' )
      expect( html ).toContain( 'href="https://click.news.example.com/x"' )
      expect( html ).toContain( 'src="https://track.news.example.com/x"' )
      expect( `${ text }${ html }` ).not.toMatch( /LONGTOKEN|SECRET|ABC123|upn=|u001/ )
    } )

    it( 'keeps a path word the footer detection looks for', () => {
      const { text, html } = bodies( stripFixture( build(), 'n' ) )

      expect( text ).toContain( 'https://click.news.example.com/unsubscribe\n' )
      expect( html ).toContain( 'href="https://news.example.com/preferences"' )
    } )

    it( 'keeps the link text and the markup around it', () => {
      const { html } = bodies( stripFixture( build(), 'n' ) )

      expect( html ).toContain( '>link text</a>' )
      expect( html ).toContain( 'width="1"' )
    } )

    it( 'leaves mailto links alone', () => {
      expect( bodies( stripFixture( build(), 'n' ) ).html )
        .toContain( 'href="mailto:hello@news.example.com"' )
    } )

    it( 'reduces the URL in List-Unsubscribe and keeps the mailto', () => {
      const unsubscribe = stripFixture( build(), 'n' ).payload?.headers
        ?.find( ( { name } ) => name === 'List-Unsubscribe' )?.value

      expect( unsubscribe ).toBe( '<https://news.example.com/unsubscribe>, <mailto:u@x.com>' )
    } )

    it( 'does not touch a URL with no path', () => {
      const message = build()

      message.payload = { ...message.payload, parts: [ {
        mimeType: 'text/plain',
        body: { data: encode( 'Go to https://example.com now' ) },
      }, {} ] }

      expect( bodies( stripFixture( message, 'n' ) ).text )
        .toBe( 'Go to https://example.com now' )
    } )
  } )

  it( 'keeps the original bytes of a body that is not UTF-8', () => {
    const message = build()
    const latin1 = Buffer.from( [ 0x43, 0x61, 0x66, 0xe9 ] ).toString( 'base64url' )

    message.payload = { ...message.payload, parts: [ {
      mimeType: 'text/plain',
      headers: [ header( 'Content-Type', 'text/plain; charset="ISO-8859-1"' ) ],
      body: { data: latin1 },
    } ] }

    expect( stripFixture( message, 'n' ).payload?.parts?.[ 0 ]?.body?.data ).toBe( latin1 )
  } )

  it( 'leaves an attachment alone', () => {
    const message = build()

    message.payload!.parts!.push( {
      mimeType: 'text/plain',
      filename: 'notes.txt',
      body: { attachmentId: 'a1', data: encode( 'see https://x.example.com/a?b=c' ) },
    } )

    expect( decode( stripFixture( message, 'n' ).payload?.parts?.[ 2 ]?.body?.data ) )
      .toBe( 'see https://x.example.com/a?b=c' )
  } )

  it( 'does not change the message it is given', () => {
    const message = build()
    const before = JSON.stringify( message )

    stripFixture( message, 'n' )

    expect( JSON.stringify( message ) ).toBe( before )
  } )

  it( 'gives the same result when run again', () => {
    const once = stripFixture( build(), 'newsletter-x' )

    expect( stripFixture( once, 'newsletter-x' ) ).toEqual( once )
  } )
} )
