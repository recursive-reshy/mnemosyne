// Services
import { runServiceChecks } from '../services/health.service.js'
// Config
import { config } from '../config.js'
// Logging
import { logger } from '../logger.js'

const MINUTE_MS = 60_000

export const startServiceMonitor = (): ( () => Promise< void > ) => {
  let busy = false
  let currentPass: Promise< void > | undefined

  const tick = (): void => {
    if( busy ) {
      return
    }

    busy = true
    currentPass = runServiceChecks()
      .catch( ( error: unknown ) => {
        logger.error( { err: error }, 'Service check failed' )
      } )
      .finally( () => {
        busy = false
      } )
  }

  tick()
  const timer = setInterval( tick, config.statusCheckIntervalMinutes * MINUTE_MS )

  return async () => {
    clearInterval( timer )

    await currentPass
  }
}
