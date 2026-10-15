// React
import type { ReactElement } from 'react'
// Shared
import type { Job } from '@mnemosyne/shared'

const STAGES = [
  { status: 'queued', label: 'Waiting to start' },
  { status: 'downloading', label: 'Downloading audio' },
  { status: 'converting', label: 'Converting audio' },
  { status: 'transcribing', label: 'Transcribing' },
  { status: 'done', label: 'Transcript ready' },
] as const

const STATUS_MESSAGES = {
  queued: 'Waiting in the queue…',
  downloading: 'Downloading audio…',
  converting: 'Converting audio…',
  transcribing: 'Transcribing…',
  done: 'Transcript ready',
} as const

const FAILED_MESSAGE = 'Transcription failed.'

function stageState( index: number, currentIndex: number ): string {
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
      <section aria-label="Job progress">
        <p>{ job.url }</p>
        <p role="alert">{ job.error ?? FAILED_MESSAGE }</p>
        <button type="button" onClick={ onRetry }>Try again</button>
      </section>
    )
  }

  const currentIndex = STAGES.findIndex( ( { status } ) => status === job.status )

  return (
    <section aria-label="Job progress">
      <p>{ job.url }</p>
      { connectionError && <p role="alert">{ `${ connectionError }. Retrying…` }</p> }
      <p role="status">{ STATUS_MESSAGES[ job.status ] }</p>
      <ol>
        { STAGES.map( ( { status, label }, index ) => {
          const isCurrent = index === currentIndex

          return (
            <li
              key={ status }
              aria-current={ isCurrent ? 'step' : undefined }
              data-state={ stageState( index, currentIndex ) }
            >
              { label }
            </li>
          )
        } ) }
      </ol>
    </section>
  )
}
