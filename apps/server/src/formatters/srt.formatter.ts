// Shared
import { Transcript } from '@mnemosyne/shared'
// Formatters
import { cleanText } from './paragraphs.js'
import { formatSrtTime } from './timestamps.js'

export function formatSrt( { segments }: Transcript ): string {
  const cues = segments
    .map( ( segment ) => ( { ...segment, text: cleanText( segment.text ) } ) )
    .filter( ( { text } ) => text !== '' )
    .map( ( { start, end, text }, index ) => {
      const times = `${ formatSrtTime( start ) } --> ${ formatSrtTime( end ) }`

      return `${ index + 1 }\n${ times }\n${ text }`
    } )

  if( cues.length === 0 ) {
    return ''
  }

  return `${ cues.join( '\n\n' ) }\n`
}
