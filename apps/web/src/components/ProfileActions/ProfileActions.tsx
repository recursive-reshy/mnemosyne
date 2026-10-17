// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'

// As elsewhere: a disabled button still takes the pointer, so its tooltip can explain why.
const DELETE_SX = { '&.Mui-disabled': { pointerEvents: 'auto', cursor: 'not-allowed' } } as const

interface ProfileActionsProps {
  deleteBlockedReason: string | null
  onNew: () => void
  onRename: () => void
  onDelete: () => void
}

export function ProfileActions(
  { deleteBlockedReason, onNew, onRename, onDelete }: ProfileActionsProps,
): ReactElement {
  return (
    <Stack direction="row" spacing={ 1 } sx={ { flexWrap: 'wrap', gap: 1 } }>
      <Button variant="outlined" onClick={ onNew }>New profile</Button>
      <Button variant="outlined" onClick={ onRename }>Rename</Button>
      <Tooltip title={ deleteBlockedReason ?? '' }>
        <span>
          <Button
            variant="outlined"
            color="error"
            onClick={ onDelete }
            disabled={ deleteBlockedReason !== null }
            sx={ DELETE_SX }
          >
            Delete
          </Button>
        </span>
      </Tooltip>
    </Stack>
  )
}
