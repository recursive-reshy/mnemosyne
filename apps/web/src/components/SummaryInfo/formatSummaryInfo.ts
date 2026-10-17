// Shared
import type { SummaryUsage } from '@mnemosyne/shared'

const SMALL_COST_USD = 0.01

const formatTokens = ( count: number ): string => `${ ( count / 1000 ).toFixed( 1 ) }k`

const formatCost = ( usd: number ): string => {
  return `~US$${ usd.toFixed( usd < SMALL_COST_USD ? 3 : 2 ) }`
}

export interface SummaryInfoText {
  line: string
  attempts: string | null
}

export const formatSummaryInfo = (
  { last_run: last, run_count: runCount, total_cost_usd: totalCost }: SummaryUsage,
  modelName: string,
): SummaryInfoText => {
  const parts = [ modelName, `${ last.profile_name } v${ last.prompt_version }` ]

  if( last.input_tokens !== null && last.output_tokens !== null ) {
    const tokensIn = formatTokens( last.input_tokens )
    const tokensOut = formatTokens( last.output_tokens )

    parts.push( `${ tokensIn } in / ${ tokensOut } out` )
  }

  if( last.cost_usd !== null ) {
    parts.push( formatCost( last.cost_usd ) )
  }

  if( last.outcome === 'failed' ) {
    parts.unshift( 'Last attempt failed' )
  }

  const total = totalCost === null ? '' : `, ${ formatCost( totalCost ) } total`

  return {
    line: parts.join( ' · ' ),
    attempts: runCount > 1 ? `${ runCount } attempts${ total }` : null,
  }
}
