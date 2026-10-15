// React
import { useEffect, useState } from 'react'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { ApiError } from '../api/apiError'
import { getJob } from '../api/jobs.api'

export const POLL_INTERVAL_MS = 2000

const JOB_GONE_MESSAGE = 'This job no longer exists. The server may have restarted.'

export interface JobState {
  job: Job | null
  error: string | null
}

interface StoredState extends JobState {
  jobId: string | null
}

export function useJob( jobId: string | null ): JobState {
  const [ stored, setStored ] = useState< StoredState >( { jobId: null, job: null, error: null } )

  useEffect( () => {
    if( jobId === null ) {
      return undefined
    }

    let isCancelled = false
    let timer: ReturnType< typeof setTimeout > | undefined

    const poll = async ( id: string ): Promise< void > => {
      let nextState: ( previous: StoredState ) => StoredState
      let isFinished: boolean

      try {
        const job = await getJob( id )

        nextState = () => ( { jobId: id, job, error: null } )
        isFinished = job.status === 'done' || job.status === 'failed'
      } catch( caught ) {
        const isGone = caught instanceof ApiError && caught.status === 404
        const message = caught instanceof Error ? caught.message : 'Unexpected error'

        nextState = ( previous ) => ( {
          jobId: id,
          job: isGone || previous.jobId !== id ? null : previous.job,
          error: isGone ? JOB_GONE_MESSAGE : message,
        } )
        isFinished = isGone
      }

      if( isCancelled ) {
        return
      }

      setStored( nextState )

      if( !isFinished ) {
        timer = setTimeout( () => void poll( id ), POLL_INTERVAL_MS )
      }
    }

    void poll( jobId )

    return () => {
      isCancelled = true
      clearTimeout( timer )
    }
  }, [ jobId ] )

  if( jobId === null || stored.jobId !== jobId ) {
    return { job: null, error: null }
  }

  return { job: stored.job, error: stored.error }
}
