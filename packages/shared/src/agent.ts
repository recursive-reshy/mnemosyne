// Packages
import { z } from 'zod'

export const LinkNote = z.object( {
  title: z.string().min( 1 ).max( 300 ),
  tags: z.array( z.string() ).max( 50 ),
  folder: z.string().nullable(),
  body: z.string().min( 1 ).max( 200_000 ),
} )
export type LinkNote = z.infer< typeof LinkNote >

export const LinkRequest = z.object( {
  note: LinkNote,
  model: z.string().min( 1 ),
  guidance: z.string().max( 20_000 ),
} )
export type LinkRequest = z.infer< typeof LinkRequest >

export const SuggestionKind = z.enum( [ 'existing_note', 'existing_concept', 'new_concept' ] )
export type SuggestionKind = z.infer< typeof SuggestionKind >

export const LinkSuggestion = z.object( {
  target: z.string().min( 1 ).max( 200 ),
  kind: SuggestionKind,
  anchor: z.string().nullable(),
  reason: z.string().min( 1 ).max( 300 ),
} )
export type LinkSuggestion = z.infer< typeof LinkSuggestion >

export const LinkUsage = z.object( {
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cache_read_input_tokens: z.number().int(),
  cache_creation_input_tokens: z.number().int(),
  tool_calls: z.number().int(),
  turns: z.number().int(),
} )
export type LinkUsage = z.infer< typeof LinkUsage >

export const LinkOutcome = z.enum( [ 'linked', 'failed' ] )
export type LinkOutcome = z.infer< typeof LinkOutcome >

export const LinkResponse = z.object( {
  outcome: LinkOutcome,
  reason: z.string().nullable(),
  suggestions: z.array( LinkSuggestion ),
  usage: LinkUsage,
} ).superRefine( ( response, context ) => {
  if( response.outcome === 'linked' && response.reason !== null ) {
    context.addIssue( {
      code: 'custom',
      path: [ 'reason' ],
      message: 'reason must be null when outcome is linked',
    } )
  }

  if( response.outcome === 'failed' && !response.reason ) {
    context.addIssue( {
      code: 'custom',
      path: [ 'reason' ],
      message: 'reason is required when outcome is failed',
    } )
  }

  if( response.outcome === 'failed' && response.suggestions.length > 0 ) {
    context.addIssue( {
      code: 'custom',
      path: [ 'suggestions' ],
      message: 'suggestions must be empty when outcome is failed',
    } )
  }
} )
export type LinkResponse = z.infer< typeof LinkResponse >

export const InstructionsResponse = z.object( {
  instructions: z.string(),
} )
export type InstructionsResponse = z.infer< typeof InstructionsResponse >
