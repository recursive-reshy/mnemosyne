// Shared
import type { LinkResponse } from '@mnemosyne/shared'
import { parseNote } from '@mnemosyne/shared'
// Clients
import { requestLinks } from '../clients/agent.client.js'
// Services
import {
  completeLinking,
  defaultFolderFor,
  failLinking,
  findJob,
  recordLinkRun,
  recordLinkSuggestions,
} from '../services/jobs.service.js'
import { resolveLinkerPrompt } from '../services/prompts.service.js'
import { resolveLinkingModel } from '../services/settings.service.js'

export const linkJob = async ( jobId: string ): Promise< void > => {
  try {
    const job = findJob( jobId )

    if( job.note_markdown === null ) {
      throw new Error( 'The job has no note to link' )
    }

    const { properties, body } = parseNote( job.note_markdown )
    const { version } = resolveLinkerPrompt()
    const model = await resolveLinkingModel()

    let response: LinkResponse

    try {
      response = await requestLinks( {
        note: {
          title: properties.title,
          tags: properties.tags,
          folder: job.target_folder ?? defaultFolderFor( job ),
          body,
        },
        model,
        guidance: version.guidance,
      } )
    } catch( error ) {
      recordLinkRun( jobId, {
        model,
        promptVersionId: version.id,
        usage: undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      } )

      throw error
    }

    const runId = recordLinkRun( jobId, {
      model,
      promptVersionId: version.id,
      usage: response.usage,
      error: response.outcome === 'failed' ? response.reason ?? 'Linking failed' : undefined,
    } )

    if( response.outcome === 'failed' ) {
      failLinking( jobId, response.reason ?? 'Linking failed' )

      return
    }

    recordLinkSuggestions( jobId, runId, response.suggestions )
    completeLinking( jobId )
  } catch( error ) {
    failLinking( jobId, error instanceof Error ? error.message : 'Unknown error' )
  }
}
