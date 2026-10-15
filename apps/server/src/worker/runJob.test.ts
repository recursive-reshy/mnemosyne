// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { Segment } from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Services
import {
  completeTranscription,
  findJob,
  markStatus,
  queueJob,
} from '../services/jobs.service.js'
// Repositories
import { clearJobs, findJobById } from '../repositories/jobStore.repository.js'
// Clients
import { downloadAudio } from '../clients/ytDlp.client.js'
import { convertToWav } from '../clients/ffmpeg.client.js'
import { transcribeAudio } from '../clients/whisperServer.client.js'
// Worker
import { runJob } from './runJob.js'
import { summarizeJob } from './summarizeJob.js'
// Node
import { rm } from 'node:fs/promises'

vi.mock( '../clients/ytDlp.client.js' )
vi.mock( '../clients/ffmpeg.client.js' )
vi.mock( '../clients/whisperServer.client.js' )
vi.mock( './summarizeJob.js' )
vi.mock( 'node:fs/promises' )
vi.mock( '../config.js', () => ( {
  config: { workDir: '/work', whisperUrl: 'http://whisper:8178', whisperModel: 'test-model' },
} ) )

const NOW = '2026-10-14T12:00:00.000Z'
const URL_FORBIDDEN =
  'yt-dlp failed: ERROR: unable to download video data: HTTP Error 403: Forbidden'

const meta = {
  title: 'A video',
  source: 'https://www.youtube.com/watch?v=abc',
  channel: 'A channel',
  duration_seconds: 12,
}
const download = { audioPath: '/work/audio.webm', meta }
const segments: Segment[] = [ { start: 0, end: 1.5, text: 'Hello' } ]

const downloadMock = vi.mocked( downloadAudio )
const convertMock = vi.mocked( convertToWav )
const transcribeMock = vi.mocked( transcribeAudio )
const rmMock = vi.mocked( rm )
const summarizeJobMock = vi.mocked( summarizeJob )

const queue = (): string => {
  return queueJob( 'https://www.youtube.com/watch?v=abc' ).id
}

const expectClientsNotCalled = (): void => {
  expect( downloadMock ).not.toHaveBeenCalled()
  expect( convertMock ).not.toHaveBeenCalled()
  expect( transcribeMock ).not.toHaveBeenCalled()
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( new Date( NOW ) )
  clearJobs()
  vi.resetAllMocks()
  downloadMock.mockResolvedValue( download )
  convertMock.mockResolvedValue( '/work/audio.wav' )
  transcribeMock.mockResolvedValue( segments )
  rmMock.mockResolvedValue( undefined )
  summarizeJobMock.mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'runJob', () => {
  it( 'moves the job to summarizing and stores the transcript and title', async () => {
    const id = queue()

    await runJob( id )

    expect( findJob( id ) ).toMatchObject( { status: 'summarizing', title: 'A video' } )
    expect( findJobById( id )?.transcript ).toEqual( {
      meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
      segments,
    } )
  } )

  it( 'passes the right arguments to each client', async () => {
    const id = queue()

    await runJob( id )

    expect( downloadMock ).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc',
      `/work/${ id }`,
    )
    expect( convertMock ).toHaveBeenCalledWith( '/work/audio.webm' )
    expect( transcribeMock ).toHaveBeenCalledWith( '/work/audio.wav', 'http://whisper:8178' )
  } )

  it( 'moves through downloading, converting and transcribing', async () => {
    const id = queue()
    const seen: string[] = []
    downloadMock.mockImplementation( () => {
      seen.push( findJob( id ).status )
      return Promise.resolve( download )
    } )
    convertMock.mockImplementation( () => {
      seen.push( findJob( id ).status )
      return Promise.resolve( '/work/audio.wav' )
    } )
    transcribeMock.mockImplementation( () => {
      seen.push( findJob( id ).status )
      return Promise.resolve( segments )
    } )

    await runJob( id )

    expect( seen ).toEqual( [ 'downloading', 'converting', 'transcribing' ] )
  } )

  describe.each( [
    { step: 'download', fail: () => downloadMock, later: [ convertMock, transcribeMock ] },
    { step: 'convert', fail: () => convertMock, later: [ transcribeMock ] },
    { step: 'transcribe', fail: () => transcribeMock, later: [] },
  ] )( 'when $step fails', ( { fail, later } ) => {
    it( 'fails the job with the message and skips later clients', async () => {
      const id = queue()
      fail().mockRejectedValue( new Error( 'boom' ) )

      await runJob( id )

      expect( findJob( id ) ).toMatchObject( { status: 'failed', error: 'boom' } )
      later.forEach( ( mock ) => expect( mock ).not.toHaveBeenCalled() )
    } )

    it( 'still removes the work folder', async () => {
      const id = queue()
      fail().mockRejectedValue( new Error( 'boom' ) )

      await runJob( id )

      expect( rmMock ).toHaveBeenCalledWith( `/work/${ id }`, { recursive: true, force: true } )
    } )

    it( 'fails with Unknown error for a non-Error rejection', async () => {
      const id = queue()
      fail().mockRejectedValue( 'nope' )

      await runJob( id )

      expect( findJob( id ) ).toMatchObject( { status: 'failed', error: 'Unknown error' } )
    } )
  } )

  it( 'summarizes after the audio is removed', async () => {
    const id = queue()

    await runJob( id )

    expect( summarizeJobMock ).toHaveBeenCalledWith( id )
    expect( rmMock.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
      summarizeJobMock.mock.invocationCallOrder[ 0 ],
    )
  } )

  it( 'does not summarize when the pipeline fails', async () => {
    const id = queue()
    transcribeMock.mockRejectedValue( new Error( 'boom' ) )

    await runJob( id )

    expect( summarizeJobMock ).not.toHaveBeenCalled()
  } )

  it( 'removes the work folder after success', async () => {
    const id = queue()

    await runJob( id )

    expect( rmMock ).toHaveBeenCalledWith( `/work/${ id }`, { recursive: true, force: true } )
  } )

  it( 'keeps the job summarizing and resolves when cleanup fails', async () => {
    const id = queue()
    const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
    rmMock.mockRejectedValue( new Error( 'disk' ) )

    await expect( runJob( id ) ).resolves.toBeUndefined()

    expect( findJob( id ).status ).toBe( 'summarizing' )
    expect( errorSpy ).toHaveBeenCalled()
  } )

  it( 'retries once after a 403, cleaning up first', async () => {
    const id = queue()
    downloadMock
      .mockRejectedValueOnce( new Error( URL_FORBIDDEN ) )
      .mockResolvedValueOnce( download )

    const run = runJob( id )
    await vi.advanceTimersByTimeAsync( 3000 )
    await run

    expect( findJob( id ).status ).toBe( 'summarizing' )
    expect( downloadMock ).toHaveBeenCalledTimes( 2 )
    expect( rmMock.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
      downloadMock.mock.invocationCallOrder[ 1 ],
    )
  } )

  it( 'fails after a second 403 without a third attempt', async () => {
    const id = queue()
    downloadMock.mockRejectedValue( new Error( URL_FORBIDDEN ) )

    const run = runJob( id )
    await vi.advanceTimersByTimeAsync( 3000 )
    await run

    expect( findJob( id ) ).toMatchObject( { status: 'failed', error: URL_FORBIDDEN } )
    expect( downloadMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'does not retry other download errors', async () => {
    const id = queue()
    downloadMock.mockRejectedValue( new Error( 'Video unavailable' ) )

    await runJob( id )

    expect( downloadMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'rejects with ConflictError when the job is not queued', async () => {
    const id = queue()
    markStatus( id, 'downloading' )

    await expect( runJob( id ) ).rejects.toBeInstanceOf( ConflictError )

    expectClientsNotCalled()
    expect( rmMock ).not.toHaveBeenCalled()
    expect( findJob( id ).status ).toBe( 'downloading' )
  } )

  describe( 'when the job is already summarizing', () => {
    const queueSummarizing = (): string => {
      const id = queue()
      markStatus( id, 'downloading' )
      markStatus( id, 'converting' )
      markStatus( id, 'transcribing' )
      completeTranscription( id, {
        meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
        segments,
      } )

      return id
    }

    it( 'runs only the summarize step', async () => {
      const id = queueSummarizing()

      await runJob( id )

      expect( summarizeJobMock ).toHaveBeenCalledExactlyOnceWith( id )
      expectClientsNotCalled()
      expect( rmMock ).not.toHaveBeenCalled()
    } )

    it( 'leaves the status to the summarize step', async () => {
      const id = queueSummarizing()

      await runJob( id )

      expect( findJob( id ).status ).toBe( 'summarizing' )
    } )
  } )

  it( 'rejects with NotFoundError for an unknown id', async () => {
    await expect( runJob( 'missing' ) ).rejects.toBeInstanceOf( NotFoundError )

    expectClientsNotCalled()
    expect( rmMock ).not.toHaveBeenCalled()
  } )
} )
