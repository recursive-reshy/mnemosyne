// Packages
import { stat } from 'node:fs/promises'
import path from 'node:path'
// Clients
import { runCommand } from './runCommand.js'

const CONVERT_TIMEOUT_MS = 30 * 60 * 1000

export const convertToWav = async ( inputPath: string ): Promise< string > => {
  const outputPath = path.join( path.dirname( inputPath ), 'converted.wav' )

  await runCommand(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      outputPath,
    ],
    CONVERT_TIMEOUT_MS,
  )

  const { size } = await stat( outputPath ).catch( () => ( { size: 0 } ) )

  if( size === 0 ) {
    throw new Error( 'ffmpeg did not produce an audio file' )
  }

  return outputPath
}
