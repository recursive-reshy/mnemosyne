// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
// App
import { downloadUrl } from '#src/api/jobs.api'

const FORMATS = [
  { format: 'md', label: 'Markdown (.md)', variant: 'contained' },
  { format: 'srt', label: 'Subtitles (.srt)', variant: 'outlined' },
  { format: 'txt', label: 'Plain text (.txt)', variant: 'outlined' },
] as const

interface DownloadLinksProps {
  jobId: string
}

export function DownloadLinks( { jobId }: DownloadLinksProps ): ReactElement {
  return (
    <Stack
      component="section"
      aria-label="Download transcript"
      direction="row"
      useFlexGap
      sx={ { flexWrap: 'wrap', gap: 1, width: '100%' } }
    >
      { FORMATS.map( ( { format, label, variant } ) => (
        <Button
          key={ format }
          component="a"
          variant={ variant }
          href={ downloadUrl( jobId, format ) }
          download
        >
          { label }
        </Button>
      ) ) }
    </Stack>
  )
}
