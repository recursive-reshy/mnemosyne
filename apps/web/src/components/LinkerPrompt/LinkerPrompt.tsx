// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { usePromptVersions } from '#src/hooks/usePromptVersions'
import { useSettings } from '#src/hooks/useSettings'
import { useUnsavedChangesWarning } from '#src/hooks/useUnsavedChangesWarning'
import { PromptEditor } from '../PromptEditor'
import { PromptHistory } from '../PromptHistory'

export function LinkerPrompt(): ReactElement {
  const profileId = useSettings().settings?.linker_profile_id ?? null
  const { versions, isLoading, error } = usePromptVersions( profileId )
  const profiles = usePromptProfiles()
  const [ draft, setDraft ] = useState< string | null >( null )
  const current = versions[ 0 ]
  const saved = current?.guidance ?? ''
  const isDirty = draft !== null && draft.trim() !== saved.trim()
  useUnsavedChangesWarning( isDirty )

  if( isLoading ) {
    return <Typography role="status">Loading the linker prompt…</Typography>
  }

  if( error !== null || profileId === null || current === undefined ) {
    return <Alert severity="error">{ error ?? 'The linker prompt was not found' }</Alert>
  }

  const clearDraft = { onSuccess: () => setDraft( null ) }
  const editorError = profiles.saveVersion.error?.message
    ?? profiles.resetProfile.error?.message
    ?? null

  return (
    <Stack spacing={ 2 }>
      <Typography variant="subtitle1" component="h4">Linker prompt</Typography>
      <PromptEditor
        value={ draft ?? saved }
        isDirty={ isDirty }
        isSaving={ profiles.saveVersion.isPending || profiles.resetProfile.isPending }
        canReset
        error={ editorError }
        onChange={ setDraft }
        onSave={ () => profiles.saveVersion.mutate(
          { id: profileId, guidance: draft ?? saved },
          clearDraft,
        ) }
        onDiscard={ () => setDraft( null ) }
        onReset={ () => profiles.resetProfile.mutate( profileId, clearDraft ) }
      />
      <PromptHistory
        profileId={ profileId }
        currentVersionId={ current.id }
        isRestoring={ profiles.restoreVersion.isPending }
        error={ profiles.restoreVersion.error?.message ?? null }
        onRestore={ ( versionId ) => profiles.restoreVersion.mutate(
          { id: profileId, versionId },
          clearDraft,
        ) }
      />
    </Stack>
  )
}
