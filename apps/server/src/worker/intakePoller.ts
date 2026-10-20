// Services
import { checkDueFeeds } from '../services/feeds.service.js'
import { checkDueSources } from '../services/gmailSources.service.js'

const TICK_MS = 60_000

export const startIntakePoller = (): ( () => Promise< void > ) => {
  let busy = false
  let currentPass: Promise< void > | undefined

  // Each intake is checked on its own, so one failing doesn't hold back the other.
  const runPass = async (): Promise< void > => {
    try {
      const checked = await checkDueFeeds()

      if( checked > 0 ) {
        console.log( `Checked ${ checked } feed(s)` )
      }
    } catch( error ) {
      console.error( 'Feed check failed', error )
    }

    try {
      const checked = await checkDueSources()

      if( checked > 0 ) {
        console.log( `Checked ${ checked } Gmail source(s)` )
      }
    } catch( error ) {
      console.error( 'Gmail source check failed', error )
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
