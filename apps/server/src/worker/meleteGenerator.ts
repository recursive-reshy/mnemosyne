// Services
import { generateForNote } from '../services/meleteGeneration.service.js'
// Repositories
import { claimNextGeneration, requeueGenerating } from '../repositories/system.repository.js'
// Logging
import { logger } from '../logger.js'
import { withLogContext } from '../logContext.js'

const POLL_INTERVAL_MS = 1000

// Makes questions for queued notes, one at a time, beside the job worker (ADR 0058)
export const startMeleteGenerator = (): ( () => Promise< void > ) => {
  let busy = false
  let stopped = false
  let currentPass: Promise< void > | undefined

  // A note left generating by a restart would otherwise never be picked up
  const requeued = requeueGenerating()

  if( requeued > 0 ) {
    logger.info( { requeued }, 'Requeued Melete notes interrupted by a restart' )
  }

  const runPass = async (): Promise< void > => {
    try {
      // Claiming marks the note generating, so never claim one that won't be run
      while( !stopped ) {
        const note = claimNextGeneration( new Date().toISOString() )

        if( note === undefined ) {
          break
        }

        const { id, user_id: userId } = note

        await withLogContext(
          { melete_note_id: id, user_id: userId },
          () => generateForNote( userId, id ),
        )
      }
    } catch( error ) {
      logger.error( { err: error }, 'Melete generator pass failed' )
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
