// Packages
import { describe, it, expect } from 'vitest'
// Gmail
import { gmailLink } from './links.js'

describe( 'gmailLink', () => {
  it( 'opens the message in the account it was received in', () => {
    expect( gmailLink( { email: 'naresh@example.com', messageId: '19a1b2c3d4e5f607' } ) )
      .toBe( 'https://mail.google.com/mail/u/naresh%40example.com/#all/19a1b2c3d4e5f607' )
  } )

  it( 'falls back to the first signed-in account when the address is not known', () => {
    expect( gmailLink( { email: null, messageId: 'abc' } ) )
      .toBe( 'https://mail.google.com/mail/u/0/#all/abc' )
  } )

  it( 'encodes characters that would end the path', () => {
    expect( gmailLink( { email: 'a+b@example.com', messageId: 'abc' } ) )
      .toBe( 'https://mail.google.com/mail/u/a%2Bb%40example.com/#all/abc' )
  } )

  it( 'makes a URL the shared contract accepts', () => {
    expect( () => new URL( gmailLink( { email: 'naresh@example.com', messageId: 'abc' } ) ) )
      .not.toThrow()
  } )
} )
