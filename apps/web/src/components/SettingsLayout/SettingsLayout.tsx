// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { Link, Outlet, useLocation } from 'react-router'
// App
import { useSettings } from '#src/hooks/useSettings'

const TABS = [
  { value: 'prompts', label: 'Prompts' },
  { value: 'models', label: 'Models' },
  { value: 'sources', label: 'Sources' },
] as const

export function SettingsLayout(): ReactElement {
  const { isLoading, error } = useSettings()
  const current = useLocation().pathname.split( '/' )[ 2 ]
  const value = TABS.some( ( tab ) => tab.value === current ) ? current : false

  return (
    <Stack spacing={ 3 } sx={ { width: '100%' } }>
      <Typography variant="h5" component="h2">Settings</Typography>
      <Tabs value={ value } aria-label="Settings sections">
        { TABS.map( ( tab ) => (
          <Tab
            key={ tab.value }
            component={ Link }
            to={ `/settings/${ tab.value }` }
            value={ tab.value }
            label={ tab.label }
          />
        ) ) }
      </Tabs>
      { isLoading && <Typography role="status">Loading settings…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { !isLoading && error === null && <Outlet /> }
    </Stack>
  )
}
