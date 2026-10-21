// React
import type { ChangeEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import type { AgentStatus } from '@mnemosyne/shared'
// App
import { useModels } from '#src/hooks/useModels'
import { useSettings } from '#src/hooks/useSettings'
import { LinkerPrompt } from '../LinkerPrompt'
import { LockedInstructions } from '../LockedInstructions'

const NOT_CONFIGURED = 'Linking isn\'t set up. Set AGENT_SECRET in .env (generate one with '
  + 'openssl rand -hex 32), start the agent service and restart the app.'

const STATUS_NOTICES = {
  unavailable: 'The agent service is unavailable. Linking is skipped until it\'s back.',
  not_configured: NOT_CONFIGURED,
} as const satisfies Partial< Record< AgentStatus, string > >

export function LinkingSettings(): ReactElement {
  const { settings, agentStatus, linkerLockedInstructions, updateSettings } = useSettings()
  const { models, source, isLoading: isLoadingModels } = useModels()
  const modelId = settings?.linking_model ?? ''
  const isListed = models.some( ( { id } ) => id === modelId )
  const options = modelId !== '' && !isListed && !isLoadingModels
    ? [ ...models, { id: modelId, display_name: modelId } ]
    : models

  const handleSwitch = ( event: ChangeEvent< HTMLInputElement > ): void => {
    updateSettings.mutate( { linking_enabled: event.target.checked } )
  }

  const handleModel = ( event: ChangeEvent< HTMLInputElement > ): void => {
    updateSettings.mutate( { linking_model: event.target.value } )
  }

  return (
    <Stack spacing={ 2 }>
      { agentStatus === 'ok' && <Typography>The agent service is reachable.</Typography> }
      { agentStatus !== null && agentStatus !== 'ok' && (
        <Alert severity={ agentStatus === 'unavailable' ? 'warning' : 'info' }>
          { STATUS_NOTICES[ agentStatus ] }
        </Alert>
      ) }
      { source === 'fallback' && (
        <Alert severity="info">
          The model list is offline, so only the current linking model is shown.
        </Alert>
      ) }
      <FormControlLabel
        label="Link notes automatically"
        control={ (
          <Switch
            checked={ settings?.linking_enabled ?? false }
            disabled={ settings === null }
            onChange={ handleSwitch }
          />
        ) }
      />
      <TextField
        select
        size="small"
        label="Linking model"
        value={ options.some( ( { id } ) => id === modelId ) ? modelId : '' }
        onChange={ handleModel }
        disabled={ settings === null || isLoadingModels }
      >
        { options.map( ( { id, display_name } ) => (
          <MenuItem key={ id } value={ id }>{ display_name }</MenuItem>
        ) ) }
      </TextField>
      <Typography role="status" variant="body2" color="text.secondary">
        { updateSettings.isSuccess ? 'Saved' : '' }
      </Typography>
      { updateSettings.isError && (
        <Alert severity="error">{ updateSettings.error?.message ?? 'Could not save' }</Alert>
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
