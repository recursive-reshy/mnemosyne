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
import { SummaryResult, summarizeTranscript } from './claude.client.js'
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

const reply = ( overrides: Record< string, unknown > = {} ): Record< string, unknown > => ( {
  stop_reason: 'end_turn',
  parsed_output: summary,
  ...overrides,
} )

beforeEach( () => {
  parse.mockReset()
  constructed.length = 0
  parse.mockResolvedValue( reply() )
} )

describe( 'summarizeTranscript', () => {
  it( 'returns the parsed summary', async () => {
    const result = await summarizeTranscript( { transcript: transcriptFixture } )

    expect( result ).toEqual( summary )
  } )

  it( 'builds the client with the key, the configured timeout and one retry', async () => {
    await summarizeTranscript( { transcript: transcriptFixture } )

    expect( constructed ).toEqual( [ {
      apiKey: 'sk-test',
      timeout: 12_345,
      maxRetries: 1,
    } ] )
  } )

  it( 'asks the summary model for structured output with room to think', async () => {
    await summarizeTranscript( { transcript: transcriptFixture } )

    const [ request ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( request ).toMatchObject( {
      model: 'claude-sonnet-5-5',
      max_tokens: 16_000,
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
    expect( typeof request.system ).toBe( 'string' )
  } )

  it( 'sends one [seconds] line per non-blank segment', async () => {
    await summarizeTranscript( { transcript: transcriptFixture } )

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

    await expect( summarizeTranscript( { transcript: transcriptFixture } ) ).rejects.toThrow(
      'Summary response did not match the expected format',
    )
  } )

  it.each( [
    [ 'max_tokens', 'Summary was cut off' ],
    [ 'refusal', 'Summary was declined' ],
  ] )( 'throws when the stop reason is %s', async ( stopReason, message ) => {
    parse.mockResolvedValue( reply( { stop_reason: stopReason } ) )

    await expect( summarizeTranscript( { transcript: transcriptFixture } ) ).rejects.toThrow(
      message,
    )
  } )

  it( 'wraps API errors with a readable message', async () => {
    parse.mockRejectedValue( new Anthropic.APIError( 429, undefined, 'Rate limited', undefined ) )

    await expect( summarizeTranscript( { transcript: transcriptFixture } ) ).rejects.toThrow(
      'Summary request failed: Rate limited',
    )
  } )

  it( 'lets other errors through unchanged', async () => {
    parse.mockRejectedValue( new TypeError( 'boom' ) )

    await expect( summarizeTranscript( { transcript: transcriptFixture } ) ).rejects.toThrow(
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
