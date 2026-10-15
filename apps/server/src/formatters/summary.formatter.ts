// Shared
import { formatClock } from '@mnemosyne/shared'
// Clients
import type { SummaryResult } from '../clients/claude.client.js'
// Formatters
import { youTubeVideoId } from './youtube.js'

type Timestamped = SummaryResult[ 'key_points' ][ number ]

const singleLine = ( value: string ): string => value.replace( /\s*\r?\n\s*/g, ' ' ).trim()

export const formatSummary = ( summary: SummaryResult, source: string ): string => {
  const videoId = youTubeVideoId( source )

  const stamp = ( seconds: number ): string => {
    const label = formatClock( seconds )

    return videoId === undefined
      ? `[${ label }]`
      : `[${ label }](https://youtu.be/${ videoId }?t=${ Math.floor( seconds ) })`
  }

  const blocks = [ `## Summary\n\n${ summary.overview.trim() }` ]

  if( summary.key_points.length > 0 ) {
    const lines = summary.key_points.map( ( { text, seconds }: Timestamped ) => {
      return `- ${ singleLine( text ) } (${ stamp( seconds ) })`
    } )

    blocks.push( `## Key points\n\n${ lines.join( '\n' ) }` )
  }

  if( summary.quotes.length > 0 ) {
    const lines = summary.quotes.map( ( { text, seconds }: Timestamped ) => {
      return `> "${ singleLine( text ) }" (${ stamp( seconds ) })`
    } )

    blocks.push( `## Notable quotes\n\n${ lines.join( '\n' ) }` )
  }

  return `${ blocks.join( '\n\n' ) }\n`
}
