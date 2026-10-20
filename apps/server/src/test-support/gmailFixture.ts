// Node
import { readFileSync } from 'node:fs'
// Packages
import type { gmail_v1 } from '@googleapis/gmail'
// Gmail
import { parseMessage } from '../gmail/parseMessage.js'
import type { ParsedMessage } from '../gmail/parseMessage.js'

export const NEWSLETTER_FIXTURES = [
  'DeepLearning',
  'Dense',
  'Dru',
  'Ideabrowser',
  'The',
] as const

// A real message saved by `pnpm fixture:gmail`, stripped, as the parser reads it.
export const loadGmailFixture = ( name: string ): ParsedMessage => {
  const file = new URL( `./gmail/${ name }.json`, import.meta.url )

  return parseMessage( JSON.parse( readFileSync( file, 'utf8' ) ) as gmail_v1.Schema$Message )
}
