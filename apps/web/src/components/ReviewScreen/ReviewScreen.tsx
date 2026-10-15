// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { useTranscript } from '#src/hooks/useTranscript'
import { DownloadLinks } from '../DownloadLinks'
import { FilenamePreview } from '../FilenamePreview'
import { SummaryEditor } from '../SummaryEditor'
import { TagInput } from '../TagInput'
import { TitleField } from '../TitleField'
import { TranscriptPane } from '../TranscriptPane'
import styles from './ReviewScreen.module.css'

interface ReviewScreenProps {
  job: Job
}

export function ReviewScreen( { job }: ReviewScreenProps ): ReactElement {
  const hasFailed = job.status === 'summary_failed'
  const [ title, setTitle ] = useState( job.title ?? '' )
  const [ tags, setTags ] = useState( job.suggested_tags )
  const [ summary, setSummary ] = useState( job.summary_markdown ?? '' )
  const { transcript, error: transcriptError } = useTranscript( job.id )

  return (
    <div className={ styles.review }>
      <h2 className={ styles.title }>{ job.title ?? job.url }</h2>
      { hasFailed && <p className="alert" role="alert">{ job.error ?? 'Summary failed.' }</p> }
      { !hasFailed && (
        <>
          <TitleField value={ title } onChange={ setTitle } />
          <FilenamePreview title={ title } />
          <TagInput tags={ tags } onChange={ setTags } />
        </>
      ) }
      <div className={ styles.columns }>
        { !hasFailed && (
          <SummaryEditor value={ summary } onChange={ setSummary } />
        ) }
        <TranscriptPane transcript={ transcript } error={ transcriptError } />
      </div>
      <DownloadLinks jobId={ job.id } />
    </div>
  )
}
