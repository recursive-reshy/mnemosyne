// Services
import { findNextQueuedJob } from '../services/jobs.service.js'
// Worker
import { runJob } from './runJob.js'

const POLL_INTERVAL_MS = 1000

export const startWorker = (): ( () => Promise< void > ) => {
  let busy = false
  let stopped = false
  let currentPass: Promise< void > | undefined

  const runPass = async (): Promise< void > => {
    try {
      let job = findNextQueuedJob()

      while( job !== undefined && !stopped ) {
        await runJob( job.id )
        job = findNextQueuedJob()
      }
    } catch( error ) {
      console.error( 'Worker pass failed', error )
    }
  }

  const startPass = (): void => {
    if( busy || stopped ) {
      return
    }

    busy = true
    currentPass = runPass().finally( () => {
      busy = false
    } )
  }

  startPass()
  const timer = setInterval( startPass, POLL_INTERVAL_MS )

  return async () => {
    clearInterval( timer )
    stopped = true

    await currentPass
  }
}
