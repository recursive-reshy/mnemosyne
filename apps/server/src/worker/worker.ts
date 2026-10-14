// Services
import { findNextQueuedJob } from '../services/jobs.service.js'
// Worker
import { runJob } from './runJob.js'

const POLL_INTERVAL_MS = 1000

export function startWorker(): () => void {
  let busy = false

  async function runPass(): Promise< void > {
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
