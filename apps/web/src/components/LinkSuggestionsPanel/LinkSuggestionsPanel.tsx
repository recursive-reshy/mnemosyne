// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { StoredLinkSuggestion } from '@mnemosyne/shared'
// App
import { LinkSuggestionRow } from './LinkSuggestionRow'

interface LinkSuggestionsPanelProps {
  suggestions: StoredLinkSuggestion[]
  note: string
  isBusy: boolean
  error: string | null
  onAccept: ( suggestion: StoredLinkSuggestion ) => void
  onReject: ( suggestion: StoredLinkSuggestion ) => void
}

export function LinkSuggestionsPanel(
  { suggestions, note, isBusy, error, onAccept, onReject }: LinkSuggestionsPanelProps,
): ReactElement {
  const ordered = [ ...suggestions ].sort( ( a, b ) => a.position - b.position )
  const pendingCount = suggestions.filter( ( { status } ) => status === 'pending' ).length

  return (
    <Stack component="section" aria-label="Suggested links" spacing={ 1 }>
      <Typography role="status" variant="body2" color="text.secondary">
        { suggestions.length === 0 ? 'No suggested links.' : `${ pendingCount } pending` }
      </Typography>
      { error !== null && <Alert severity="error">{ error }</Alert> }
      <List disablePadding>
        { ordered.map( ( suggestion ) => (
          <LinkSuggestionRow
            key={ suggestion.id }
            suggestion={ suggestion }
            note={ note }
            isBusy={ isBusy }
            onAccept={ onAccept }
            onReject={ onReject }
          />
        ) ) }
      </List>
    </Stack>
  )
}
