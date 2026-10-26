// Services
import { claimNextJob } from '../services/jobs.service.js'
// Worker
import { runJob } from './runJob.js'
// Logging
import { logger } from '../logger.js'
import { withLogContext } from '../logContext.js'

const POLL_INTERVAL_MS = 1000

export const startWorker = (): ( () => Promise< void > ) => {
  let busy = false
  let stopped = false
  let currentPass: Promise< void > | undefined

  const runPass = async (): Promise< void > => {
    try {
      let next = claimNextJob()

      while( next !== undefined && !stopped ) {
        const { job: { id }, userId } = next

        await withLogContext( { job_id: id, user_id: userId }, () => runJob( userId, id ) )
        next = claimNextJob()
      }
    } catch( error ) {
      logger.error( { err: error }, 'Worker pass failed' )
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
