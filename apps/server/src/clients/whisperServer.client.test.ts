// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest'
import { readFile } from 'node:fs/promises'
// Clients
import { transcribeAudio } from './whisperServer.client.js'
// Fixtures
import { whisperResponseFixture } from '../test-support/whisperResponse.fixture.js'

vi.mock( 'node:fs/promises' )

const whisperUrl = 'http://localhost:8178'
const audioPath = '/tmp/work/a.wav'

function jsonResponse( body: unknown, status: number = 200 ): Response {
  return new Response( JSON.stringify( body ), { status } )
}

let fetchMock: MockInstance< typeof fetch >

beforeEach( () => {
  vi.mocked( readFile ).mockResolvedValue( Buffer.from( 'RIFFfake' ) )
  fetchMock = vi.spyOn( globalThis, 'fetch' )
  fetchMock.mockResolvedValue( jsonResponse( whisperResponseFixture ) )
} )

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'transcribeAudio', () => {
  it( 'posts the file and response_format to /inference', async () => {
    await transcribeAudio( audioPath, whisperUrl )

    expect( fetchMock ).toHaveBeenCalledTimes( 1 )
    const [ url, init ] = fetchMock.mock.calls[ 0 ] as [ URL | string, RequestInit ]
    const body = init.body as FormData
    const file = body.get( 'file' ) as File
    expect( String( url ) ).toBe( 'http://localhost:8178/inference' )
    expect( init.method ).toBe( 'POST' )
    expect( body ).toBeInstanceOf( FormData )
    expect( file.name ).toBe( 'a.wav' )
    expect( await file.text() ).toBe( 'RIFFfake' )
    expect( body.get( 'response_format' ) ).toBe( 'verbose_json' )
  } )

  it( 'handles a trailing slash in the URL', async () => {
    await transcribeAudio( audioPath, 'http://host.docker.internal:8178/' )

    const [ url ] = fetchMock.mock.calls[ 0 ] as [ URL | string ]
    expect( String( url ) ).toBe( 'http://host.docker.internal:8178/inference' )
  } )

  it( 'returns trimmed segments only', async () => {
    const segments = await transcribeAudio( audioPath, whisperUrl )

    expect( segments ).toEqual( [
      { start: 0, end: 3.52, text: 'Hello from MemoSign, this is a quick transcription test.' },
    ] )
  } )

  it( 'returns several segments in order', async () => {
    fetchMock.mockResolvedValue( jsonResponse( {
      segments: [
        { start: 0, end: 1, text: ' a ' },
        { start: 1, end: 2, text: ' b' },
        { start: 2, end: 3, text: ' c' },
      ],
    } ) )

    const segments = await transcribeAudio( audioPath, whisperUrl )

    expect( segments.map( ( { text } ) => text ) ).toEqual( [ 'a', 'b', 'c' ] )
  } )

  it( 'returns an empty array for no segments', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { segments: [] } ) )

    expect( await transcribeAudio( audioPath, whisperUrl ) ).toEqual( [] )
  } )

  it( 'throws with the status for a non-2xx response', async () => {
    fetchMock.mockResolvedValue( new Response( 'boom', { status: 500 } ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow(
      'whisper-server returned 500',
    )
  } )

  it( 'throws with the URL when the server is unreachable', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'fetch failed' ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow(
      'Could not reach whisper-server at http://localhost:8178',
    )
  } )

  it( 'throws a timeout message when the request exceeds the limit', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'The operation timed out.', 'TimeoutError' ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow(
      'whisper-server did not finish within 60 minutes',
    )
  } )

  it( 'throws on JSON without segments', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { text: 'hi' } ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow(
      'Unexpected response from whisper-server',
    )
  } )

  it( 'throws on a body that is not JSON', async () => {
    fetchMock.mockResolvedValue( new Response( 'not json', { status: 200 } ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow(
      'Unexpected response from whisper-server',
    )
  } )

  it( 'throws the error message from an error body', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'failed to read audio' } ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow(
      'failed to read audio',
    )
  } )

  it( 'throws on an invalid segment', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { segments: [ { start: 5, end: 2, text: 'x' } ] } ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow(
      'Unexpected response from whisper-server',
    )
  } )

  it( 'throws a readable error when the audio file is missing', async () => {
    vi.mocked( readFile ).mockRejectedValue( new Error( 'ENOENT' ) )

    await expect( transcribeAudio( audioPath, whisperUrl ) ).rejects.toThrow( audioPath )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )
} )
