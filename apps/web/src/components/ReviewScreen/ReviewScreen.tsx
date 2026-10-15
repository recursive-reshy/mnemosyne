// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { DownloadLinks } from '../DownloadLinks'
import { FilenamePreview } from '../FilenamePreview'
import { TitleField } from '../TitleField'
import styles from './ReviewScreen.module.css'

interface ReviewScreenProps {
  job: Job
}

export function ReviewScreen( { job }: ReviewScreenProps ): ReactElement {
  const hasFailed = job.status === 'summary_failed'
  const [ title, setTitle ] = useState( job.title ?? '' )

  return (
    <div className={ styles.review }>
      <h2 className={ styles.title }>{ job.title ?? job.url }</h2>
      { hasFailed && <p className="alert" role="alert">{ job.error ?? 'Summary failed.' }</p> }
      { !hasFailed && (
        <>
          <TitleField value={ title } onChange={ setTitle } />
          <FilenamePreview title={ title } />
        </>
      ) }
      <div className={ styles.columns }>
        { !hasFailed && (
          <section className={ styles.pane } aria-label="Summary">
            <p className={ styles.summary }>{ job.summary_markdown }</p>
          </section>
        ) }
        <section className={ styles.pane } aria-label="Transcript">
          <p>Transcript</p>
        </section>
      </div>
      <DownloadLinks jobId={ job.id } />
    </div>
  )
}
