// Services
import {
  completeSummary,
  failSummary,
  findJob,
  getSource,
  recordSummaryRun,
} from '../services/jobs.service.js'
import { resolvePrompt } from '../services/prompts.service.js'
import { getDefaultModel } from '../services/settings.service.js'
// Clients
import { SummaryError, summarizeSource } from '../clients/claude.client.js'
import type { SummaryOutcome } from '../clients/claude.client.js'
// Services
import { interimOwnerId } from '../services/interimOwner.js'
// Formatters
import { cleanSummary } from '../formatters/summary.cleanup.js'
import { formatSummary } from '../formatters/summary.formatter.js'

export const summarizeJob = async ( jobId: string ): Promise< void > => {
  try {
    const job = findJob( jobId )
    const document = getSource( jobId )
    const userId = interimOwnerId()
    const { version } = resolvePrompt( userId, job.prompt_profile_id )
    const model = job.summary_model ?? getDefaultModel( userId )
    const promptVersionId = version.id

    let outcome: SummaryOutcome

    try {
      outcome = await summarizeSource( { document, model, guidance: version.guidance } )
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

    const summary = cleanSummary( outcome.summary, document )

    completeSummary(
      jobId,
      formatSummary( summary, document ),
      summary.tags,
    )
  } catch( error ) {
    failSummary( jobId, error instanceof Error ? error.message : 'Unknown error' )
  }
}
