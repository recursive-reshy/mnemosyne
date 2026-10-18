// Services
import {
  completeSummary,
  failSummary,
  findJob,
  getSource,
  recordSummaryRun,
} from '../services/jobs.service.js'
import { resolvePrompt } from '../services/prompts.service.js'
import { getSettings } from '../services/settings.service.js'
// Clients
import { SummaryError, summarizeTranscript } from '../clients/claude.client.js'
import type { SummaryOutcome } from '../clients/claude.client.js'
// Formatters
import { cleanSummary } from '../formatters/summary.cleanup.js'
import { formatSummary } from '../formatters/summary.formatter.js'

export const summarizeJob = async ( jobId: string ): Promise< void > => {
  try {
    const job = findJob( jobId )
    const source = getSource( jobId )

    if( source.kind !== 'video' ) {
      throw new Error( 'Article summaries are not supported yet' )
    }

    const transcript = { meta: source.meta, segments: source.segments }
    const { version } = resolvePrompt( job.prompt_profile_id )
    const model = job.summary_model ?? getSettings().default_model
    const promptVersionId = version.id

    let outcome: SummaryOutcome

    try {
      outcome = await summarizeTranscript( { transcript, model, guidance: version.guidance } )
    } catch( error ) {
      recordSummaryRun( jobId, {
        model,
        promptVersionId,
        usage: error instanceof SummaryError ? error.usage : undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      } )

      throw error
    }

    recordSummaryRun( jobId, { model, promptVersionId, usage: outcome.usage } )

    const summary = cleanSummary( outcome.summary, transcript )

    completeSummary(
      jobId,
      formatSummary( summary, transcript.meta.source ),
      summary.tags,
    )
  } catch( error ) {
    failSummary( jobId, error instanceof Error ? error.message : 'Unknown error' )
  }
}
