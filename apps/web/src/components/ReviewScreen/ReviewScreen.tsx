// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { parseTimestampSeconds } from '#src/timestamp'
import { useDiscardJob } from '#src/hooks/useDiscardJob'
import { useDraft } from '#src/hooks/useDraft'
import { useRetrySummary } from '#src/hooks/useRetrySummary'
import { useSaveJob } from '#src/hooks/useSaveJob'
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
  onSaved: ( savedPath: string ) => void
  onDiscarded: () => void
}

export function ReviewScreen( { job, onSaved, onDiscarded }: ReviewScreenProps ): ReactElement {
  const hasFailed = job.status === 'summary_failed'
  const { draft, setTitle, setTags, setBody } = useDraft( job.id, {
    title: job.title ?? '',
    tags: job.suggested_tags,
    body: job.summary_markdown ?? '',
  } )
  const { transcript, error: transcriptError } = useTranscript( job.id )
  const [ focusSecond, setFocusSecond ] = useState< number | null >( null )
  const save = useSaveJob( job.id )
  const discard = useDiscardJob( job.id )
  const retry = useRetrySummary( job.id )

  const handleCaretLine = ( line: string ): void => {
    const seconds = parseTimestampSeconds( line )

    if( seconds !== null ) {
      setFocusSecond( seconds )
    }
  }

  const handleDiscard = (): void => {
    discard.mutate( undefined, { onSuccess: () => onDiscarded() } )
  }

  const handleSave = (): void => {
    save.mutate(
      { title: draft.title, tags: draft.tags, body: draft.body },
      { onSuccess: ( savedPath ) => onSaved( savedPath ) },
    )
  }

  return (
    <div className={ styles.review }>
      <h2 className={ styles.title }>{ job.title ?? job.url }</h2>
      { hasFailed && <p className="alert" role="alert">{ job.error ?? 'Summary failed.' }</p> }
      { !hasFailed && (
        <>
          <TitleField value={ draft.title } onChange={ setTitle } />
          <FilenamePreview title={ draft.title } />
          <TagInput tags={ draft.tags } onChange={ setTags } />
        </>
      ) }
      <div className={ `${ styles.columns } ${ hasFailed ? styles.single : '' }` }>
        { !hasFailed && (
          <SummaryEditor
            value={ draft.body }
            onChange={ setBody }
            onCaretLine={ handleCaretLine }
          />
        ) }
        <TranscriptPane
          transcript={ transcript }
          error={ transcriptError }
          focusSecond={ focusSecond }
        />
      </div>
      <DownloadLinks jobId={ job.id } />
      { save.isError && <p className="alert" role="alert">{ save.error.message }</p> }
      { retry.isError && <p className="alert" role="alert">{ retry.error.message }</p> }
      { discard.isError && <p className="alert" role="alert">{ discard.error.message }</p> }
      <div className={ styles.actions }>
        { hasFailed
          ? (
            <button
              type="button"
              className={ styles.primary }
              disabled={ retry.isPending }
              onClick={ () => retry.mutate() }
            >
              { retry.isPending ? 'Retrying…' : 'Retry summary' }
            </button>
          )
          : (
            <button
              type="button"
              className={ styles.primary }
              disabled={ save.isPending || draft.title.trim() === '' }
              onClick={ handleSave }
            >
              { save.isPending ? 'Saving…' : 'Save to vault' }
            </button>
          ) }
        <button
          type="button"
          className={ styles.secondary }
          disabled={ discard.isPending }
          onClick={ handleDiscard }
        >
          Discard
        </button>
      </div>
    </div>
  )
}
