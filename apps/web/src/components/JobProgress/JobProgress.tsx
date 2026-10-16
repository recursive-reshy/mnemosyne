// React
import type { ReactElement } from 'react'
// Packages
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { Job } from '@mnemosyne/shared'

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

type StageState = 'complete' | 'current' | 'pending'

const STAGE_ICONS = {
  complete: <CheckCircleIcon color="success" fontSize="small" />,
  current: <RadioButtonCheckedIcon color="primary" fontSize="small" />,
  pending: <RadioButtonUncheckedIcon color="disabled" fontSize="small" />,
} as const satisfies Record< StageState, ReactElement >

const stageState = ( index: number, currentIndex: number ): StageState => {
  if( index === currentIndex ) {
    return 'current'
  }

  return index < currentIndex ? 'complete' : 'pending'
}

const SECTION_SX = { width: '100%', alignItems: 'flex-start' } as const

const URL_SX = { overflowWrap: 'anywhere' } as const

interface JobProgressProps {
  job: Job
  connectionError: string | null
  onRetry: () => void
}

export function JobProgress( { job, connectionError, onRetry }: JobProgressProps ): ReactElement {
  if( job.status === 'failed' ) {
    return (
      <Stack component="section" aria-label="Job progress" spacing={ 2 } sx={ SECTION_SX }>
        <Typography variant="body2" color="text.secondary" sx={ URL_SX }>{ job.url }</Typography>
        <Alert severity="error">{ job.error ?? FAILED_MESSAGE }</Alert>
        <Button variant="contained" onClick={ onRetry }>Try again</Button>
      </Stack>
    )
  }

  const currentIndex = STAGES.findIndex( ( { status } ) => status === job.status )

  return (
    <Stack component="section" aria-label="Job progress" spacing={ 2 } sx={ SECTION_SX }>
      <Typography variant="body2" color="text.secondary" sx={ URL_SX }>{ job.url }</Typography>
      { connectionError && (
        <Alert severity="error">{ `${ connectionError }. Retrying…` }</Alert>
      ) }
      <Typography role="status" sx={ { fontWeight: 600 } }>
        { STATUS_MESSAGES[ job.status ] }
      </Typography>
      <List component="ol" disablePadding>
        { STAGES.map( ( { status, label }, index ) => {
          const isCurrent = index === currentIndex
          const state = job.status === 'ready_for_review'
            ? 'complete'
            : stageState( index, currentIndex )

          return (
            <ListItem
              key={ status }
              disableGutters
              aria-current={ isCurrent ? 'step' : undefined }
              data-state={ state }
            >
              <ListItemIcon sx={ { minWidth: 32 } }>{ STAGE_ICONS[ state ] }</ListItemIcon>
              <ListItemText
                primary={ label }
                slotProps={ { primary: { sx: { fontWeight: isCurrent ? 700 : 400 } } } }
              />
            </ListItem>
          )
        } ) }
      </List>
    </Stack>
  )
}
