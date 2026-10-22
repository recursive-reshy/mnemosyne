// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { formatBytes } from '#src/formatBytes'
import { useRunBackup } from '#src/hooks/useRunBackup'

// Shown on the backup row whatever its state: a backup can be taken when the last one failed.
export function BackupControls(): ReactElement {
  const {
    mutate: backUp,
    isPending,
    isSuccess,
    isError,
    data,
    error,
  } = useRunBackup()
  const spinner = <CircularProgress size={ 16 } aria-label="Backing up" />

  return (
    <Stack spacing={ 1 } sx={ { alignItems: 'flex-start' } }>
      <Button
        size="small"
        variant="outlined"
        disabled={ isPending }
        onClick={ () => backUp() }
        startIcon={ isPending ? spinner : undefined }
      >
        Back up now
      </Button>
      { isSuccess && data !== undefined && (
        <Typography role="status" variant="body2" sx={ { overflowWrap: 'anywhere' } }>
          { `Backed up to ${ data.file } (${ formatBytes( data.bytes ) })` }
        </Typography>
      ) }
      { isError && <Alert severity="error">{ error?.message }</Alert> }
    </Stack>
  )
}
