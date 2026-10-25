// Services
import { deleteExpiredJobs } from '../services/jobs.service.js'
import { sweepSessions } from '../services/session.service.js'
// Config
import { config } from '../config.js'
// Logging
import { logger } from '../logger.js'

const MINUTE_MS = 60_000

export const startSweeper = (): ( () => void ) => {
  const sweep = (): void => {
    try {
      const deleted = deleteExpiredJobs()

      if( deleted > 0 ) {
        logger.info( { deleted }, 'Deleted expired jobs' )
      }
    } catch( error ) {
      logger.error( { err: error }, 'Sweep failed' )
    }

    try {
      const deleted = sweepSessions( new Date() )

      if( deleted > 0 ) {
        logger.info( { deleted }, 'Deleted expired sessions' )
      }
    } catch( error ) {
      logger.error( { err: error }, 'Session sweep failed' )
    }
  }

  sweep()
  const timer = setInterval( sweep, config.cleanupIntervalMinutes * MINUTE_MS )

  return () => clearInterval( timer )
}
