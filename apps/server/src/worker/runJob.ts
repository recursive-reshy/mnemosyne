// Packages
import { rm } from 'node:fs/promises'
import path from 'node:path'
// Shared
import { Transcript } from '@mnemosyne/shared'
// Services
import {
  completeJob,
  failJob,
  findJob,
  markStatus,
} from '../services/jobs.service.js'
// Clients
import { downloadAudio } from '../clients/ytDlp.client.js'
import { convertToWav } from '../clients/ffmpeg.client.js'
import { transcribeAudio } from '../clients/whisperServer.client.js'
// Config
import { config } from '../config.js'

const RETRY_DELAY_MS = 3000
const removeOptions = { recursive: true, force: true }

const downloadWithRetry = async (
  url: string,
  workDir: string,
): ReturnType< typeof downloadAudio > => {
  try {
    return await downloadAudio( url, workDir )
  } catch( error ) {
    if( !( error instanceof Error && error.message.includes( '403' ) ) ) {
      throw error
    }
  }

  await rm( workDir, removeOptions )
  await new Promise( ( resolve ) => setTimeout( resolve, RETRY_DELAY_MS ) )

  return downloadAudio( url, workDir )
}

export const runJob = async ( jobId: string ): Promise< void > => {
  const job = findJob( jobId )
  markStatus( jobId, 'downloading' )

  const workDir = path.join( config.workDir, jobId )

  try {
    const { audioPath, meta } = await downloadWithRetry( job.url, workDir )

    markStatus( jobId, 'converting' )
    const wavPath = await convertToWav( audioPath )

    markStatus( jobId, 'transcribing' )
    const segments = await transcribeAudio( wavPath, config.whisperUrl )

    const transcript = Transcript.parse( {
      meta: {
        ...meta,
        transcribed_at: new Date().toISOString(),
        model: config.whisperModel,
      },
      segments,
    } )

    completeJob( jobId, transcript )
  } catch( error ) {
    failJob( jobId, error instanceof Error ? error.message : 'Unknown error' )
  } finally {
    try {
      await rm( workDir, removeOptions )
    } catch( cleanupError ) {
      console.error( `Could not remove work folder ${ workDir }`, cleanupError )
    }
  }
}
