// React
import type { ReactElement } from 'react'
// Packages
import Typography from '@mui/material/Typography'
// App
import { GatePage } from '../GatePage'

// Replaced by the real picker in 7.3.
export function ChooseVault(): ReactElement {
  return (
    <GatePage title="Choose your vault">
      <Typography color="text.secondary">Pick the folder that holds your notes.</Typography>
    </GatePage>
  )
}
