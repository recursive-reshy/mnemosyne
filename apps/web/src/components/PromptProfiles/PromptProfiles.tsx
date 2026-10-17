// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// App
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { useUnsavedChangesWarning } from '#src/hooks/useUnsavedChangesWarning'
import { ConfirmDialog } from '../ConfirmDialog'
import { ProfileActions } from '../ProfileActions'
import { ProfileNameDialog } from '../ProfileNameDialog'
import { PromptEditor } from '../PromptEditor'

type Dialog = 'create' | 'rename' | 'delete' | { switchTo: string } | null

export function PromptProfiles(): ReactElement {
  const state = usePromptProfiles()
  const { profiles, createProfile, renameProfile, deleteProfile } = state
  const defaultId = useSettings().settings?.default_profile_id
  const [ selectedId, setSelectedId ] = useState< string | null >( null )
  const [ draft, setDraft ] = useState< string | null >( null )
  const [ dialog, setDialog ] = useState< Dialog >( null )

  const profile = profiles.find( ( { id } ) => id === selectedId )
    ?? profiles.find( ( { id } ) => id === defaultId )
    ?? profiles[ 0 ]
  const saved = profile?.current_version.guidance ?? ''
  const isDirty = draft !== null && draft.trim() !== saved.trim()
  useUnsavedChangesWarning( isDirty )

  if( state.isLoading ) {
    return <Typography role="status">Loading prompt profiles…</Typography>
  }

  if( state.error !== null || profile === undefined ) {
    return <Alert severity="error">{ state.error ?? 'No prompt profiles found' }</Alert>
  }

  const select = ( id: string | null ): void => {
    setSelectedId( id )
    setDraft( null )
    setDialog( null )
  }
  const open = ( next: 'create' | 'rename' ): void => {
    createProfile.reset()
    renameProfile.reset()
    setDialog( next )
  }
  const handlePick = ( id: string ): void => {
    if( isDirty ) {
      setDialog( { switchTo: id } )
    } else {
      select( id )
    }
  }

  const switchTo = typeof dialog === 'object' && dialog !== null ? dialog.switchTo : null
  let deleteBlockedReason: string | null = null

  if( profile.id === defaultId ) {
    deleteBlockedReason = 'The default profile can\'t be deleted. '
      + 'Make another profile the default first.'
  } else if( profiles.length <= 1 ) {
    deleteBlockedReason = 'The last remaining profile can\'t be deleted.'
  }

  return (
    <Stack spacing={ 2 }>
      <Typography variant="subtitle1" component="h4">Prompt profiles</Typography>
      <TextField
        select
        size="small"
        label="Prompt profile"
        value={ profile.id }
        onChange={ ( event ) => handlePick( event.target.value ) }
      >
        { profiles.map( ( { id, name } ) => (
          <MenuItem key={ id } value={ id }>
            { id === defaultId ? `${ name } (default)` : name }
          </MenuItem>
        ) ) }
      </TextField>
      <ProfileActions
        deleteBlockedReason={ deleteBlockedReason }
        onNew={ () => open( 'create' ) }
        onRename={ () => open( 'rename' ) }
        onDelete={ () => setDialog( 'delete' ) }
      />
      { deleteProfile.isError && <Alert severity="error">{ deleteProfile.error?.message }</Alert> }
      <PromptEditor
        value={ draft ?? saved }
        isDirty={ isDirty }
        isSaving={ state.saveVersion.isPending || state.resetProfile.isPending }
        canReset={ profile.can_reset }
        error={ state.saveVersion.error?.message ?? state.resetProfile.error?.message ?? null }
        onChange={ setDraft }
        onSave={ () => state.saveVersion.mutate(
          { id: profile.id, guidance: draft ?? saved },
          { onSuccess: () => setDraft( null ) },
        ) }
        onDiscard={ () => setDraft( null ) }
        onReset={ () => state.resetProfile.mutate(
          profile.id,
          { onSuccess: () => setDraft( null ) },
        ) }
      />
      { ( dialog === 'create' || dialog === 'rename' ) && (
        <ProfileNameDialog
          mode={ dialog }
          open
          initialName={ dialog === 'rename' ? profile.name : '' }
          initialGuidance={ draft ?? saved }
          error={ ( dialog === 'create' ? createProfile : renameProfile ).error?.message ?? null }
          isSaving={ createProfile.isPending || renameProfile.isPending }
          onCancel={ () => setDialog( null ) }
          onSubmit={ ( { name, guidance } ) => {
            if( dialog === 'create' ) {
              createProfile.mutate(
                { name, guidance: guidance ?? '' },
                { onSuccess: ( created ) => select( created.id ) },
              )
            } else {
              renameProfile.mutate(
                { id: profile.id, name },
                { onSuccess: () => setDialog( null ) },
              )
            }
          } }
        />
      ) }
      <ConfirmDialog
        open={ dialog === 'delete' }
        title="Delete this profile?"
        message={ `${ profile.name } will leave the list. `
          + 'Videos already summarized with it keep its name.' }
        confirmLabel="Delete"
        onConfirm={ () => deleteProfile.mutate( profile.id, { onSuccess: () => select( null ) } ) }
        onCancel={ () => setDialog( null ) }
      />
      <ConfirmDialog
        open={ switchTo !== null }
        title="Discard unsaved changes?"
        message={ `Your edits to ${ profile.name } haven't been saved.` }
        confirmLabel="Discard"
        onConfirm={ () => select( switchTo ) }
        onCancel={ () => setDialog( null ) }
      />
    </Stack>
  )
}
