// Packages
import type { gmail_v1 } from '@googleapis/gmail'

export interface MessageOptions {
  subject?: string
  from?: string
  receivedAt?: string
  html?: string
  text?: string
}

const encode = ( text: string ): string => Buffer.from( text ).toString( 'base64url' )

// What `users.messages.get` returns: headers only for `metadata`, headers and bodies for `full`.
export const buildMessage = (
  id: string,
  { subject, from, receivedAt, html, text }: MessageOptions = {},
  format: 'full' | 'metadata' = 'full',
): gmail_v1.Schema$Message => {
  const headers = [
    { name: 'Subject', value: subject ?? `Subject of ${ id }` },
    { name: 'From', value: from ?? 'Ada <ada@example.com>' },
  ]
  const date = new Date( receivedAt ?? '2026-10-19T08:00:00.000Z' ).getTime()

  if( format === 'metadata' ) {
    return { id, internalDate: String( date ), payload: { headers } }
  }

  return {
    id,
    internalDate: String( date ),
    payload: {
      mimeType: 'multipart/alternative',
      headers,
      parts: [
        {
          mimeType: 'text/plain',
          headers: [ { name: 'Content-Type', value: 'text/plain; charset="UTF-8"' } ],
          body: { data: encode( text ?? `Text of ${ id }` ) },
        },
        {
          mimeType: 'text/html',
          headers: [ { name: 'Content-Type', value: 'text/html; charset="UTF-8"' } ],
          body: { data: encode( html ?? `<p>Html of ${ id }</p>` ) },
        },
      ],
    },
  }
}
