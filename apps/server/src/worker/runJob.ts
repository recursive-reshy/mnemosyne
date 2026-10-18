// Packages
import path from 'node:path'
// Errors
import { ConflictError } from '../errors.js'
// Services
import {
  completeAcquisition,
  failJob,
  findJob,
  markStatus,
} from '../services/jobs.service.js'
// Sources
import { adapterFor } from '../sources/index.js'
// Config
import { config } from '../config.js'
// Worker
import { summarizeJob } from './summarizeJob.js'

export const runJob = async ( jobId: string ): Promise< void > => {
  const job = findJob( jobId )

  if( job.status === 'summarizing' ) {
    await summarizeJob( jobId )

    return
  }

  try {
    const document = await adapterFor( job.source_type ).acquire( {
      job,
      workDir: path.join( config.workDir, jobId ),
      markStatus: ( status ) => {
        markStatus( jobId, status )
      },
    } )

    completeAcquisition( jobId, document )
  } catch( error ) {
    // A refused status change means the job is not ours to run, not that acquiring failed
    if( error instanceof ConflictError ) {
      throw error
    }

    failJob( jobId, error instanceof Error ? error.message : 'Unknown error' )
  }

  if( findJob( jobId ).status === 'summarizing' ) {
    await summarizeJob( jobId )
  }
}
