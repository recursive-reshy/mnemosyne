// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { SummaryUsage } from '@mnemosyne/shared'
// App
import { useModels } from '#src/hooks/useModels'
import { formatSummaryInfo } from './formatSummaryInfo'

interface SummaryInfoProps {
  usage: SummaryUsage
}

export function SummaryInfo( { usage }: SummaryInfoProps ): ReactElement {
  const { models } = useModels()
  const { model } = usage.last_run
  const name = models.find( ( { id } ) => id === model )?.display_name ?? model
  const { line, attempts } = formatSummaryInfo( usage, name )

  return (
    <Stack>
      <Typography variant="body2" color="text.secondary">{ line }</Typography>
      { attempts !== null && (
        <Typography variant="body2" color="text.secondary">{ attempts }</Typography>
      ) }
    </Stack>
  )
}
