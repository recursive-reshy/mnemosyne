// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const ExtractionRunRecord = z.object( {
  gmail_message_row: z.string(),
  model: z.string(),
  input_tokens: z.int().nullable(),
  output_tokens: z.int().nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'extracted', 'no_jobs', 'failed' ] ),
  postings_count: z.int(),
  error: z.string().nullable(),
  created_at: z.string(),
} )
export type ExtractionRunRecord = z.infer< typeof ExtractionRunRecord >

const StoredExtractionRun = ExtractionRunRecord.extend( { id: z.int() } )
export type StoredExtractionRun = z.infer< typeof StoredExtractionRun >

export const insertExtractionRun = (
  userId: string,
  run: ExtractionRunRecord,
): StoredExtractionRun => {
  const { lastInsertRowid } = getDatabase()
    .prepare( `INSERT INTO extraction_runs (
        user_id, gmail_message_row, model, input_tokens, output_tokens, cost_usd, outcome,
        postings_count, error, created_at
      ) VALUES (
        @user_id, @gmail_message_row, @model, @input_tokens, @output_tokens, @cost_usd, @outcome,
        @postings_count, @error, @created_at
      )` )
    .run( { ...run, user_id: userId } )

  return StoredExtractionRun.parse( getDatabase()
    .prepare( 'SELECT * FROM extraction_runs WHERE id = ?' )
    .get( lastInsertRowid ) )
}
