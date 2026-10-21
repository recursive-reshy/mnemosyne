// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { useSettings } from '#src/hooks/useSettings'
import { LinkerPrompt } from '../LinkerPrompt'
import { LockedInstructions } from '../LockedInstructions'
import { PromptProfiles } from '../PromptProfiles'

// A stopgap until the list and editor layout replaces it (task 4.4).
export function PromptsTab(): ReactElement {
  const { lockedInstructions, linkerLockedInstructions } = useSettings()

  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <PromptProfiles />
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
      <LinkerPrompt />
      { linkerLockedInstructions === null
        ? (
          <Typography variant="body2" color="text.secondary">
            Unavailable while the agent service is down.
          </Typography>
        )
        : (
          <LockedInstructions
            title="Instructions the app always sends when linking"
            text={ linkerLockedInstructions }
          />
        ) }
    </Stack>
  )
}
