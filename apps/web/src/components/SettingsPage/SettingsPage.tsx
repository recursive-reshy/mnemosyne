// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { useSettings } from '#src/hooks/useSettings'
import { FeedSettings } from '../FeedSettings'
import { LockedInstructions } from '../LockedInstructions'
import { PromptProfiles } from '../PromptProfiles'
import { SummarizerDefaults } from '../SummarizerDefaults'

export function SettingsPage(): ReactElement {
  const { lockedInstructions, isLoading, error } = useSettings()

  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <Typography variant="h5" component="h2">Settings</Typography>
      <Typography variant="h6" component="h3">Summarizer</Typography>
      { isLoading && <Typography role="status">Loading settings…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { !isLoading && error === null && (
        <>
          <SummarizerDefaults />
          <PromptProfiles />
          <FeedSettings />
          { lockedInstructions !== null && (
            <>
              <LockedInstructions
                title="Instructions the app always sends for videos"
                text={ lockedInstructions.video }
              />
              <LockedInstructions
                title="Instructions the app always sends for articles"
                text={ lockedInstructions.article }
              />
            </>
          ) }
        </>
      ) }
    </Stack>
  )
}
