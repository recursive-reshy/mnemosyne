// React
import type { ReactElement } from 'react'
// Packages
import { Link } from 'react-router'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { formatExpiry } from '#src/expiry'
import styles from './JobList.module.css'

const STATUS_LABELS = {
  queued: 'Queued',
  downloading: 'Downloading',
  converting: 'Converting',
  transcribing: 'Transcribing',
  summarizing: 'Summarizing',
  ready_for_review: 'Ready for review',
  summary_failed: 'Summary failed',
  saved: 'Saved',
  failed: 'Failed',
} as const satisfies Record< Job[ 'status' ], string >

const EXPIRING_STATUSES: Job[ 'status' ][] = [ 'ready_for_review', 'summary_failed' ]

interface JobListProps {
  jobs: Job[]
  now: number
}

export function JobList( { jobs, now }: JobListProps ): ReactElement | null {
  if( jobs.length === 0 ) {
    return null
  }

  return (
    <ul className={ styles.list } aria-label="Jobs">
      { jobs.map( ( job ) => (
        <li key={ job.id } className={ styles.item }>
          <Link className={ styles.link } to={ `/jobs/${ job.id }` }>
            { job.title ?? job.url }
          </Link>
          <span className={ styles.status }>{ STATUS_LABELS[ job.status ] }</span>
          { job.expires_at !== null && EXPIRING_STATUSES.includes( job.status ) && (
            <span className={ styles.expiry }>{ formatExpiry( job.expires_at, now ) }</span>
          ) }
        </li>
      ) ) }
    </ul>
  )
}
