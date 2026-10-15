// Services
import { findNextQueuedJob } from '../services/jobs.service.js'
// Worker
import { runJob } from './runJob.js'

const POLL_INTERVAL_MS = 1000

export const startWorker = (): ( () => void ) => {
  let busy = false

  const runPass = async (): Promise< void > => {
    if( busy ) {
      return
    }

    busy = true

    try {
      let job = findNextQueuedJob()

      while( job !== undefined ) {
        await runJob( job.id )
        job = findNextQueuedJob()
      }
    } catch( error ) {
      console.error( 'Worker pass failed', error )
    } finally {
      busy = false
    }
  }

  void runPass()
  const timer = setInterval( () => void runPass(), POLL_INTERVAL_MS )

  return () => clearInterval( timer )
}
