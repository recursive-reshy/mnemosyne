// Packages
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
// Shared
import { Transcript, cleanText } from '@mnemosyne/shared'
// Config
import { config } from '../config.js'
import { getSummaryModel } from '../settings.js'

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

interface SummaryInput {
  transcript: Transcript
}

const MAX_TOKENS = 16_000

const SYSTEM_PROMPT = [
  'You summarize a transcript of a talk or video for a personal note-taking vault.',
  'Each transcript line starts with the second at which it begins, in square brackets.',
  'Write the overview in a few paragraphs covering the main argument.',
  'List the key points, and give each the second where it is made.',
  'Pick notable quotes. Copy each one verbatim from the transcript, and give the second',
  'where it occurs.',
  'Suggest 3 to 5 short topical tags.',
].join( ' ' )

const toTranscriptLines = ( { segments }: Transcript ): string => {
  return segments
    .map( ( { start, text } ) => ( { start, text: cleanText( text ) } ) )
    .filter( ( { text } ) => text !== '' )
    .map( ( { start, text } ) => `[${ Math.floor( start ) }] ${ text }` )
    .join( '\n' )
}

export const summarizeTranscript = async (
  { transcript }: SummaryInput,
): Promise< SummaryResult > => {
  const client = new Anthropic( {
    apiKey: config.anthropicApiKey,
    timeout: config.summaryTimeoutMs,
    maxRetries: 1,
  } )

  try {
    const response = await client.messages.parse( {
      model: getSummaryModel(),
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [ { role: 'user', content: toTranscriptLines( transcript ) } ],
      output_config: { effort: 'medium', format: zodOutputFormat( SummaryResult ) },
    } )

    if( response.stop_reason === 'max_tokens' ) {
      throw new Error( 'Summary was cut off before it finished' )
    }

    if( response.stop_reason === 'refusal' ) {
      throw new Error( 'Summary was declined by the model' )
    }

    if( response.parsed_output === null ) {
      throw new Error( 'Summary response did not match the expected format' )
    }

    return response.parsed_output
  } catch( error ) {
    if( error instanceof Anthropic.APIError ) {
      throw new Error( `Summary request failed: ${ error.message }`, { cause: error } )
    }

    throw error
  }
}
