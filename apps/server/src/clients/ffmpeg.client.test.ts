// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
import { stat } from 'node:fs/promises'
// Clients
import { convertToWav } from './ffmpeg.client.js'
import { runCommand } from './runCommand.js'

vi.mock( './runCommand.js' )
vi.mock( 'node:fs/promises' )

const stubStat = ( size: number ): void => {
  vi.mocked( stat ).mockResolvedValue( { size } as Awaited< ReturnType< typeof stat > > )
}

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( runCommand ).mockResolvedValue( { stdout: '', stderr: '' } )
  stubStat( 1024 )
} )

describe( 'convertToWav', () => {
  it( 'runs ffmpeg with the exact arguments and a 30 minute timeout', async () => {
    await convertToWav( '/tmp/work/job1/audio.webm' )

    expect( runCommand ).toHaveBeenCalledWith(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        '/tmp/work/job1/audio.webm',
        '-vn',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        '/tmp/work/job1/converted.wav',
      ],
      30 * 60 * 1000,
    )
  } )

  it( 'resolves with the converted.wav path next to the input', async () => {
    const result = await convertToWav( '/tmp/work/job1/audio.webm' )

    expect( result ).toBe( '/tmp/work/job1/converted.wav' )
  } )

  it( 'handles an m4a input and a path with spaces as one argument', async () => {
    const result = await convertToWav( '/tmp/my work/job 1/audio.m4a' )

    const args = vi.mocked( runCommand ).mock.calls[ 0 ]?.[ 1 ]
    expect( result ).toBe( '/tmp/my work/job 1/converted.wav' )
    expect( args?.[ 6 ] ).toBe( '/tmp/my work/job 1/audio.m4a' )
    expect( args ).toHaveLength( 15 )
  } )

  it( 'checks the output file after ffmpeg succeeds', async () => {
    await convertToWav( '/tmp/work/job1/audio.webm' )

    expect( stat ).toHaveBeenCalledWith( '/tmp/work/job1/converted.wav' )
  } )

  it( 'throws when the output file is missing', async () => {
    vi.mocked( stat ).mockRejectedValue( new Error( 'ENOENT' ) )

    await expect( convertToWav( '/tmp/work/job1/audio.webm' ) ).rejects.toThrow(
      'ffmpeg did not produce an audio file',
    )
  } )

  it( 'throws when the output file is empty', async () => {
    stubStat( 0 )

    await expect( convertToWav( '/tmp/work/job1/audio.webm' ) ).rejects.toThrow(
      'ffmpeg did not produce an audio file',
    )
  } )

  it( 'propagates runCommand errors unchanged and skips stat', async () => {
    const error = new Error( 'ffmpeg failed: x.webm: Invalid data found when processing input' )
    vi.mocked( runCommand ).mockRejectedValue( error )

    await expect( convertToWav( '/tmp/work/job1/audio.webm' ) ).rejects.toBe( error )
    expect( stat ).not.toHaveBeenCalled()
  } )
} )
