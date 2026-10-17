// Packages
import Anthropic from '@anthropic-ai/sdk'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Clients
import { SummaryError, SummaryResult, summarizeTranscript } from './claude.client.js'
// Summarizer
import { buildSystemPrompt } from '../summarizer/prompts.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

const { parse, constructed } = vi.hoisted( () => ( {
  parse: vi.fn(),
  constructed: [] as unknown[],
} ) )

vi.mock( '@anthropic-ai/sdk', () => {
  class APIError extends Error {
    constructor( status: number, error: unknown, message: string ) {
      super( message )
    }
  }

  class MockAnthropic {
    static APIError = APIError
    messages = { parse }

    constructor( options: unknown ) {
      constructed.push( options )
    }
  }

  return { default: MockAnthropic }
} )
vi.mock( '../config.js', () => ( {
  config: { anthropicApiKey: 'sk-test', summaryTimeoutMs: 12_345 },
} ) )

const summary: SummaryResult = {
  overview: 'A short talk about formatters.',
  key_points: [ { text: 'Formatters are pure', seconds: 9 } ],
  quotes: [ { text: 'No I/O is involved.', seconds: 22 } ],
  tags: [ 'formatters' ],
}

const input = {
  transcript: transcriptFixture,
  model: 'claude-opus-5-5',
  guidance: 'Focus on pricing.',
}

const reply = ( overrides: Record< string, unknown > = {} ): Record< string, unknown > => ( {
  stop_reason: 'end_turn',
  parsed_output: summary,
  usage: { input_tokens: 1234, output_tokens: 56 },
  ...overrides,
} )

beforeEach( () => {
  parse.mockReset()
  constructed.length = 0
  parse.mockResolvedValue( reply() )
} )

describe( 'summarizeTranscript', () => {
  it( 'returns the parsed summary with the tokens it used', async () => {
    const result = await summarizeTranscript( input )

    expect( result ).toEqual( {
      summary,
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'builds the client with the key, the configured timeout and one retry', async () => {
    await summarizeTranscript( input )

    expect( constructed ).toEqual( [ {
      apiKey: 'sk-test',
      timeout: 12_345,
      maxRetries: 1,
    } ] )
  } )

  it( 'asks the summary model for structured output with room to think', async () => {
    await summarizeTranscript( input )

    const [ request ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( request ).toMatchObject( {
      model: 'claude-opus-5-5',
      max_tokens: 16_000,
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
  } )

  it( 'sends the locked instructions followed by the guidance as the system prompt', async () => {
    await summarizeTranscript( input )

    const [ request ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( request.system ).toBe( buildSystemPrompt( 'Focus on pricing.' ) )
  } )

  it( 'sends one [seconds] line per non-blank segment', async () => {
    await summarizeTranscript( input )

    const [ request ] = parse.mock.calls[ 0 ] as [
      { messages: { role: string, content: string }[] },
    ]

    expect( request.messages ).toEqual( [ {
      role: 'user',
      content: [
        '[0] Welcome to the talk.',
        '[4] Today we cover formatters.',
        '[9] They are pure functions.',
        '[22] No I/O is involved.',
        '[135] Last, the Markdown output.',
      ].join( '\n' ),
    } ] )
  } )

  it( 'throws when the output could not be parsed', async () => {
    parse.mockResolvedValue( reply( { parsed_output: null } ) )

    await expect( summarizeTranscript( input ) ).rejects.toThrow(
      'Summary response did not match the expected format',
    )
  } )

  it.each( [
    [ 'max_tokens', 'Summary was cut off' ],
    [ 'refusal', 'Summary was declined' ],
  ] )( 'throws when the stop reason is %s', async ( stopReason, message ) => {
    parse.mockResolvedValue( reply( { stop_reason: stopReason } ) )

    await expect( summarizeTranscript( input ) ).rejects.toThrow(
      message,
    )
  } )

  it.each( [
    [ { parsed_output: null }, 'Summary response did not match the expected format' ],
    [ { stop_reason: 'max_tokens' }, 'Summary was cut off' ],
    [ { stop_reason: 'refusal' }, 'Summary was declined' ],
  ] )( 'carries the billed tokens on an unusable response (%j)', async ( overrides, message ) => {
    parse.mockResolvedValue( reply( overrides ) )

    const error: unknown = await summarizeTranscript( input ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( SummaryError )
    expect( ( error as SummaryError ).message ).toContain( message )
    expect( ( error as SummaryError ).usage ).toEqual( { input_tokens: 1234, output_tokens: 56 } )
  } )

  it( 'throws a SummaryError without usage for an API error', async () => {
    parse.mockRejectedValue( new Anthropic.APIError( 500, undefined, 'Overloaded', undefined ) )

    const error: unknown = await summarizeTranscript( input ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( SummaryError )
    expect( ( error as SummaryError ).usage ).toBeUndefined()
  } )

  it( 'wraps API errors with a readable message', async () => {
    parse.mockRejectedValue( new Anthropic.APIError( 429, undefined, 'Rate limited', undefined ) )

    await expect( summarizeTranscript( input ) ).rejects.toThrow(
      'Summary request failed: Rate limited',
    )
  } )

  it( 'lets other errors through unchanged', async () => {
    parse.mockRejectedValue( new TypeError( 'boom' ) )

    await expect( summarizeTranscript( input ) ).rejects.toThrow(
      'boom',
    )
  } )
} )

describe( 'SummaryResult', () => {
  it( 'accepts a valid summary and rejects a missing overview', () => {
    expect( SummaryResult.safeParse( summary ).success ).toBe( true )
    expect( SummaryResult.safeParse( { ...summary, overview: undefined } ).success ).toBe( false )
  } )
} )
