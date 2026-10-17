// Packages
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
// Shared
import { Transcript, cleanText } from '@mnemosyne/shared'
// Config
import { config } from '../config.js'
// Summarizer
import { buildSystemPrompt } from '../summarizer/prompts.js'
import { SUMMARY_MAX_TOKENS } from '../summarizer/models.js'

const Timestamped = z.object( {
  text: z.string(),
  seconds: z.number(),
} )

export const SummaryResult = z.object( {
  overview: z.string(),
  key_points: z.array( Timestamped ),
  quotes: z.array( Timestamped ),
  tags: z.array( z.string() ),
} )
export type SummaryResult = z.infer< typeof SummaryResult >

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
}

export interface SummaryOutcome {
  summary: SummaryResult
  usage: TokenUsage
}

interface SummaryInput {
  transcript: Transcript
  model: string
  guidance: string
}

export class SummaryError extends Error {
  readonly usage: TokenUsage | undefined

  constructor( message: string, options: { usage?: TokenUsage, cause?: unknown } = {} ) {
    super( message, { cause: options.cause } )
    this.name = 'SummaryError'
    this.usage = options.usage
  }
}

const toTranscriptLines = ( { segments }: Transcript ): string => {
  return segments
    .map( ( { start, text } ) => ( { start, text: cleanText( text ) } ) )
    .filter( ( { text } ) => text !== '' )
    .map( ( { start, text } ) => `[${ Math.floor( start ) }] ${ text }` )
    .join( '\n' )
}

export const summarizeTranscript = async (
  { transcript, model, guidance }: SummaryInput,
): Promise< SummaryOutcome > => {
  const client = new Anthropic( {
    apiKey: config.anthropicApiKey,
    timeout: config.summaryTimeoutMs,
    maxRetries: 1,
  } )

  try {
    const response = await client.messages.parse( {
      model,
      max_tokens: SUMMARY_MAX_TOKENS,
      system: buildSystemPrompt( guidance ),
      messages: [ { role: 'user', content: toTranscriptLines( transcript ) } ],
      output_config: { effort: 'medium', format: zodOutputFormat( SummaryResult ) },
    } )
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }

    if( response.stop_reason === 'max_tokens' ) {
      throw new SummaryError( 'Summary was cut off before it finished', { usage } )
    }

    if( response.stop_reason === 'refusal' ) {
      throw new SummaryError( 'Summary was declined by the model', { usage } )
    }

    if( response.parsed_output === null ) {
      throw new SummaryError( 'Summary response did not match the expected format', { usage } )
    }

    return { summary: response.parsed_output, usage }
  } catch( error ) {
    if( error instanceof Anthropic.APIError ) {
      throw new SummaryError( `Summary request failed: ${ error.message }`, { cause: error } )
    }

    throw error
  }
}
