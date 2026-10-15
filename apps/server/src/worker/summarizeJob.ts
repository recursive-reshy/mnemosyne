// Services
import {
  completeSummary,
  failSummary,
  getTranscript,
} from '../services/jobs.service.js'
// Clients
import { summarizeTranscript } from '../clients/claude.client.js'
// Formatters
import { cleanSummary } from '../formatters/summary.cleanup.js'
import { formatSummary } from '../formatters/summary.formatter.js'

export const summarizeJob = async ( jobId: string ): Promise< void > => {
  try {
    const transcript = getTranscript( jobId )

    const summary = cleanSummary( await summarizeTranscript( { transcript } ), transcript )

    completeSummary(
      jobId,
      formatSummary( summary, transcript.meta.source ),
      summary.tags,
    )
  } catch( error ) {
    failSummary( jobId, error instanceof Error ? error.message : 'Unknown error' )
  }
}
