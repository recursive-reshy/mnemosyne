// Services
import { deleteExpiredJobs } from '../services/jobs.service.js'
// Config
import { config } from '../config.js'

const MINUTE_MS = 60_000

export const startSweeper = (): ( () => void ) => {
  const sweep = (): void => {
    try {
      const deleted = deleteExpiredJobs()

      if( deleted > 0 ) {
        console.log( `Deleted ${ deleted } expired job(s)` )
      }
    } catch( error ) {
      console.error( 'Sweep failed', error )
    }
  }

  sweep()
  const timer = setInterval( sweep, config.cleanupIntervalMinutes * MINUTE_MS )

  return () => clearInterval( timer )
}
