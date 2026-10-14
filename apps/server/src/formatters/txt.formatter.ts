// Shared
import { Transcript } from '@mnemosyne/shared'
// Formatters
import { groupParagraphs } from './paragraphs.js'

export function formatTxt( { segments }: Transcript ): string {
  const paragraphs = groupParagraphs( segments )

  if( paragraphs.length === 0 ) {
    return ''
  }

  return `${ paragraphs.map( ( { text } ) => text ).join( '\n\n' ) }\n`
}
