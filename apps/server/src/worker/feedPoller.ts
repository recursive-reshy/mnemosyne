// Services
import { checkDueFeeds } from '../services/feeds.service.js'

const TICK_MS = 60_000

export const startFeedPoller = (): ( () => Promise< void > ) => {
  let busy = false
  let currentPass: Promise< void > | undefined

  const runPass = async (): Promise< void > => {
    try {
      const checked = await checkDueFeeds()

      if( checked > 0 ) {
        console.log( `Checked ${ checked } feed(s)` )
      }
    } catch( error ) {
      console.error( 'Feed check failed', error )
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
