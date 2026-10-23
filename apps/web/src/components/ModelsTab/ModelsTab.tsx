// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { LinkingSettings } from '../LinkingSettings'
import { MeleteSettings } from '../MeleteSettings'
import { SummarizerDefaults } from '../SummarizerDefaults'

export function ModelsTab(): ReactElement {
  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <Typography variant="h6" component="h3">Summarizer</Typography>
      <SummarizerDefaults />
      <Typography variant="h6" component="h3">Linking</Typography>
      <LinkingSettings />
      <Typography variant="h6" component="h3">Melete</Typography>
      <MeleteSettings />
    </Stack>
  )
}
