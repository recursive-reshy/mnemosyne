// Services
import { checkDueFeeds } from '../services/feeds.service.js'
import { checkDueSources } from '../services/gmailSources.service.js'
// Logging
import { logger } from '../logger.js'

const TICK_MS = 60_000

export const startIntakePoller = (): ( () => Promise< void > ) => {
  let busy = false
  let currentPass: Promise< void > | undefined

  // Each intake is checked on its own, so one failing doesn't hold back the other.
  const runPass = async (): Promise< void > => {
    try {
      const checked = await checkDueFeeds()

      if( checked > 0 ) {
        logger.info( { checked }, 'Checked feeds' )
      }
    } catch( error ) {
      logger.error( { err: error }, 'Feed check failed' )
    }

    try {
      const checked = await checkDueSources()

      if( checked > 0 ) {
        logger.info( { checked }, 'Checked Gmail sources' )
      }
    } catch( error ) {
      logger.error( { err: error }, 'Gmail source check failed' )
    }
  }

  const tick = (): void => {
    if( busy ) {
      return
    }

    busy = true
    currentPass = runPass().finally( () => {
      busy = false
    } )
  }

  const timer = setInterval( tick, TICK_MS )

  return async () => {
    clearInterval( timer )

    await currentPass
  }
}
