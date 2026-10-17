// Services
import {
  completeSummary,
  failSummary,
  getTranscript,
} from '../services/jobs.service.js'
// Clients
import { summarizeTranscript } from '../clients/claude.client.js'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from '../summarizer/models.js'
import { SEEDED_PROFILES } from '../summarizer/prompts.js'
// Formatters
import { cleanSummary } from '../formatters/summary.cleanup.js'
import { formatSummary } from '../formatters/summary.formatter.js'

export const summarizeJob = async ( jobId: string ): Promise< void > => {
  try {
    const transcript = getTranscript( jobId )

    const { summary: raw } = await summarizeTranscript( {
      transcript,
      model: SHIPPED_DEFAULT_MODEL,
      guidance: SEEDED_PROFILES[ 2 ]?.guidance ?? '',
    } )
    const summary = cleanSummary( raw, transcript )

    completeSummary(
      jobId,
      formatSummary( summary, transcript.meta.source ),
      summary.tags,
    )
  } catch( error ) {
    failSummary( jobId, error instanceof Error ? error.message : 'Unknown error' )
  }
}
