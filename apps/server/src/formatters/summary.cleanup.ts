// Shared
import { Transcript, cleanText, normalizeTag } from '@mnemosyne/shared'
// Clients
import type { SummaryResult } from '../clients/claude.client.js'

const MAX_TAGS = 5

export const cleanSummary = (
  summary: SummaryResult,
  { meta, segments }: Transcript,
): SummaryResult => {
  const spoken = cleanText( segments.map( ( { text } ) => text ).join( ' ' ) )
  const isInRange = ( { seconds }: { seconds: number } ): boolean => {
    return seconds >= 0 && seconds <= meta.duration_seconds
  }

  const tags = summary.tags
    .map( normalizeTag )
    .filter( ( tag, index, all ) => {
      return tag !== '' && tag !== 'mnemosyne' && all.indexOf( tag ) === index
    } )
    .slice( 0, MAX_TAGS )

  return {
    overview: summary.overview,
    key_points: summary.key_points.filter( isInRange ),
    quotes: summary.quotes
      .map( ( quote ) => ( { ...quote, text: cleanText( quote.text ) } ) )
      .filter( ( quote ) => quote.text !== '' && spoken.includes( quote.text ) )
      .filter( isInRange ),
    tags,
  }
}
