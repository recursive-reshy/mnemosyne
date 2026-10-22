// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
// App
import { FeedSettings } from '../FeedSettings'
import { GmailSettings } from '../GmailSettings'
import { StatusPanel } from '../StatusPanel'

export function SourcesTab(): ReactElement {
  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '52rem' } }>
      <StatusPanel />
      <FeedSettings />
      <GmailSettings />
    </Stack>
  )
}
