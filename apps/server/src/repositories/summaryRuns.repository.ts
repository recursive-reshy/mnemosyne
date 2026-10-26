// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const SummaryRunRecord = z.object( {
  job_id: z.string(),
  model: z.string(),
  prompt_version_id: z.int(),
  input_tokens: z.int().nullable(),
  output_tokens: z.int().nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'succeeded', 'failed' ] ),
  error: z.string().nullable(),
  created_at: z.string(),
} )
export type SummaryRunRecord = z.infer< typeof SummaryRunRecord >

const StoredSummaryRun = SummaryRunRecord.extend( { id: z.int() } )

export const insertSummaryRun = ( userId: string, run: SummaryRunRecord ): void => {
  getDatabase()
    .prepare( `INSERT INTO summary_runs (
        user_id, job_id, model, prompt_version_id, input_tokens, output_tokens, cost_usd,
        outcome, error, created_at
      ) VALUES (
        @user_id, @job_id, @model, @prompt_version_id, @input_tokens, @output_tokens, @cost_usd,
        @outcome, @error, @created_at
      )` )
    .run( { ...run, user_id: userId } )
}

export const listRunsForJob = (
  userId: string,
  jobId: string,
): z.infer< typeof StoredSummaryRun >[] => {
  return z.array( StoredSummaryRun ).parse( getDatabase()
    .prepare( 'SELECT * FROM summary_runs WHERE job_id = ? AND user_id = ? ORDER BY id' )
    .all( jobId, userId ) )
}
