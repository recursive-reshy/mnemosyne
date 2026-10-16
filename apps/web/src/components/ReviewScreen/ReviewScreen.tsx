// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Shared
import { parseNote } from '@mnemosyne/shared'
import type { Job } from '@mnemosyne/shared'
// App
import { parseTimestampSeconds } from '#src/timestamp'
import { useDiscardJob } from '#src/hooks/useDiscardJob'
import { useAutosaveDraft } from '#src/hooks/useAutosaveDraft'
import type { AutosaveStatus } from '#src/hooks/useAutosaveDraft'
import { useRetrySummary } from '#src/hooks/useRetrySummary'
import { useSaveJob } from '#src/hooks/useSaveJob'
import { useTranscript } from '#src/hooks/useTranscript'
import { DownloadLinks } from '../DownloadLinks'
import { FilenamePreview } from '../FilenamePreview'
import { PropertiesPanel } from '../PropertiesPanel'
import { SummaryEditor } from '../SummaryEditor'
import { TranscriptPane } from '../TranscriptPane'
import styles from './ReviewScreen.module.css'

interface ReviewScreenProps {
  job: Job
  onSaved: ( savedPath: string ) => void
  onDiscarded: () => void
}

const STATUS_LABELS: Record< Exclude< AutosaveStatus, 'error' >, string > = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
}

const noteTitle = ( note: string ): string | null => {
  try {
    return parseNote( note ).properties.title
  } catch{
    return null
  }
}

export function ReviewScreen( { job, onSaved, onDiscarded }: ReviewScreenProps ): ReactElement {
  const hasFailed = job.status === 'summary_failed'
  const autosave = useAutosaveDraft( job )
  const title = noteTitle( autosave.note )
  const { transcript, error: transcriptError } = useTranscript( job.id )
  const [ focusSecond, setFocusSecond ] = useState< number | null >( null )
  const save = useSaveJob( job.id, autosave.flush )
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

  const handleBlur = (): void => {
    void autosave.flush().then( ( isSaved ) => {
      if( isSaved ) {
        autosave.adoptServerNote()
      }
    } )
  }

  const handleSave = (): void => {
    save.mutate( undefined, { onSuccess: ( savedPath ) => onSaved( savedPath ) } )
  }

  return (
    <div className={ styles.review }>
      <h2 className={ styles.title }>{ job.title ?? job.url }</h2>
      { hasFailed && <p className="alert" role="alert">{ job.error ?? 'Summary failed.' }</p> }
      { !hasFailed && (
        <>
          <PropertiesPanel note={ autosave.note } onChange={ autosave.setNote } />
          <FilenamePreview title={ title ?? job.title ?? '' } />
        </>
      ) }
      <div className={ `${ styles.columns } ${ hasFailed ? styles.single : '' }` }>
        { !hasFailed && (
          <SummaryEditor
            value={ autosave.note }
            onChange={ autosave.setNote }
            onCaretLine={ handleCaretLine }
            onBlur={ handleBlur }
          />
        ) }
        <TranscriptPane
          transcript={ transcript }
          error={ transcriptError }
          focusSecond={ focusSecond }
        />
      </div>
      { !hasFailed && autosave.status === 'error' && (
        <p className="alert" role="alert">{ `Not saved: ${ autosave.message ?? '' }` }</p>
      ) }
      { !hasFailed && autosave.status !== 'error' && (
        <p role="status">{ STATUS_LABELS[ autosave.status ] }</p>
      ) }
      <DownloadLinks jobId={ job.id } />
      { save.isError && autosave.status !== 'error' && (
        <p className="alert" role="alert">{ save.error.message }</p>
      ) }
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
              disabled={ save.isPending || title === null || title.trim() === '' }
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
