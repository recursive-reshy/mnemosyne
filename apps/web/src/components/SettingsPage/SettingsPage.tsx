// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export function SettingsPage(): ReactElement {
  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <Typography variant="h5" component="h2">Settings</Typography>
      <Typography variant="h6" component="h3">Summarizer</Typography>
    </Stack>
  )
}
