// React
import type { ReactElement } from 'react'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import styles from './JobProgress.module.css'

const STAGES = [
  { status: 'queued', label: 'Waiting to start' },
  { status: 'downloading', label: 'Downloading audio' },
  { status: 'converting', label: 'Converting audio' },
  { status: 'transcribing', label: 'Transcribing' },
  { status: 'summarizing', label: 'Summarizing' },
  { status: 'ready_for_review', label: 'Ready for review' },
] as const

const STATUS_MESSAGES = {
  queued: 'Waiting in the queue…',
  downloading: 'Downloading audio…',
  converting: 'Converting audio…',
  transcribing: 'Transcribing…',
  summarizing: 'Summarizing…',
  ready_for_review: 'Ready for review',
  summary_failed: 'Summary failed',
  saved: 'Saved',
} as const

const FAILED_MESSAGE = 'Transcription failed.'

const stageState = ( index: number, currentIndex: number ): string => {
  if( index === currentIndex ) {
    return 'current'
  }

  return index < currentIndex ? 'complete' : 'pending'
}

interface JobProgressProps {
  job: Job
  connectionError: string | null
  onRetry: () => void
}

export function JobProgress( { job, connectionError, onRetry }: JobProgressProps ): ReactElement {
  if( job.status === 'failed' ) {
    return (
      <section className={ styles.progress } aria-label="Job progress">
        <p className={ styles.url }>{ job.url }</p>
        <p className="alert" role="alert">{ job.error ?? FAILED_MESSAGE }</p>
        <button className={ styles.retryButton } type="button" onClick={ onRetry }>
          Try again
        </button>
      </section>
    )
  }

  const currentIndex = STAGES.findIndex( ( { status } ) => status === job.status )

  return (
    <section className={ styles.progress } aria-label="Job progress">
      <p className={ styles.url }>{ job.url }</p>
      { connectionError && (
        <p className="alert" role="alert">{ `${ connectionError }. Retrying…` }</p>
      ) }
      <p className={ styles.status } role="status">{ STATUS_MESSAGES[ job.status ] }</p>
      <ol className={ styles.stages }>
        { STAGES.map( ( { status, label }, index ) => {
          const isCurrent = index === currentIndex
          const state = job.status === 'ready_for_review'
            ? 'complete'
            : stageState( index, currentIndex )

          return (
            <li
              key={ status }
              className={ styles.stage }
              aria-current={ isCurrent ? 'step' : undefined }
              data-state={ state }
            >
              { label }
            </li>
          )
        } ) }
      </ol>
    </section>
  )
}
