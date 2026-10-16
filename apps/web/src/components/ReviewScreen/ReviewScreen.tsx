// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
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
import { NoteDestination } from '../NoteDestination'
import { NoteEditor } from '../NoteEditor'
import type { NoteEditorMode } from '../NoteEditor'
import { PropertiesPanel } from '../PropertiesPanel'
import { ReviewActions } from '../ReviewActions'
import { TranscriptPane } from '../TranscriptPane'

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

const COLUMNS_SX = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: 'minmax( 0, 1fr )',
} as const

const TWO_COLUMNS_SX = {
  ...COLUMNS_SX,
  alignItems: 'start',
  gridTemplateColumns: { xs: 'minmax( 0, 1fr )', lg: 'repeat( 2, minmax( 0, 1fr ) )' },
} as const

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
  const [ mode, setMode ] = useState< NoteEditorMode >( 'rich-text' )
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

  const handleModeChange = ( next: NoteEditorMode ): void => {
    setMode( next )
    handleBlur()
  }

  const handleSave = (): void => {
    save.mutate( undefined, { onSuccess: ( savedPath ) => onSaved( savedPath ) } )
  }

  return (
    <Stack spacing={ 2 } sx={ { width: '100%' } }>
      <Typography variant="h6" component="h2" sx={ { overflowWrap: 'anywhere' } }>
        { job.title ?? job.url }
      </Typography>
      { hasFailed && <Alert severity="error">{ job.error ?? 'Summary failed.' }</Alert> }
      { !hasFailed && (
        <>
          { mode === 'rich-text' && (
            <PropertiesPanel note={ autosave.note } onChange={ autosave.setNote } />
          ) }
          <NoteDestination
            title={ title ?? job.title ?? '' }
            folder={ autosave.folder }
            onFolderChange={ autosave.setFolder }
          />
        </>
      ) }
      <Box sx={ hasFailed ? COLUMNS_SX : TWO_COLUMNS_SX }>
        { !hasFailed && (
          <NoteEditor
            value={ autosave.note }
            onChange={ autosave.setNote }
            onModeChange={ handleModeChange }
            onBlur={ handleBlur }
            onCaretText={ handleCaretLine }
          />
        ) }
        <TranscriptPane
          transcript={ transcript }
          error={ transcriptError }
          focusSecond={ focusSecond }
        />
      </Box>
      { !hasFailed && autosave.status === 'error' && (
        <Alert severity="error">{ `Not saved: ${ autosave.message ?? '' }` }</Alert>
      ) }
      { !hasFailed && autosave.status !== 'error' && (
        <Typography role="status">{ STATUS_LABELS[ autosave.status ] }</Typography>
      ) }
      <DownloadLinks jobId={ job.id } />
      { save.isError && autosave.status !== 'error' && (
        <Alert severity="error">{ save.error.message }</Alert>
      ) }
      { retry.isError && <Alert severity="error">{ retry.error.message }</Alert> }
      { discard.isError && <Alert severity="error">{ discard.error.message }</Alert> }
      <ReviewActions
        hasFailed={ hasFailed }
        canSave={ title !== null && title.trim() !== '' }
        isSaving={ save.isPending }
        isRetrying={ retry.isPending }
        isDiscarding={ discard.isPending }
        onSave={ handleSave }
        onRetry={ () => retry.mutate() }
        onDiscard={ handleDiscard }
      />
    </Stack>
  )
}
