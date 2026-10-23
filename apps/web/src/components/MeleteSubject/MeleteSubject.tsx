// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useParams } from 'react-router'
// App
import {
  useEnrollSubject,
  useRetryGeneration,
  useSetNoteEnrolled,
  useUpdateSubject,
} from '#src/hooks/useMeleteMutations'
import { useMeleteSubject } from '#src/hooks/useMeleteSubject'
import { MeleteNoteRow } from '../MeleteNoteRow'
import { SubjectControls } from '../SubjectControls'

export function MeleteSubject(): ReactElement {
  const { subjectId = '' } = useParams()
  const { subject, notes, isLoading, error } = useMeleteSubject( subjectId )
  const enrollSubject = useEnrollSubject()
  const updateSubject = useUpdateSubject()
  const setNoteEnrolled = useSetNoteEnrolled()
  const retryGeneration = useRetryGeneration()
  const changeError = [ enrollSubject, updateSubject, setNoteEnrolled, retryGeneration ]
    .find( ( mutation ) => mutation.isError )?.error?.message ?? null

  if( isLoading ) {
    return <Typography role="status">Loading subject…</Typography>
  }

  if( subject === null ) {
    return <Alert severity="error">{ error ?? 'Could not load the subject' }</Alert>
  }

  return (
    <Stack spacing={ 2 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <Link component={ RouterLink } to="/melete" underline="hover">Today</Link>
      <Typography variant="h5" component="h2">{ subject.name }</Typography>
      <Typography color="text.secondary">
        { `${ subject.note_count } notes · ${ subject.enrolled_count } enrolled`
          + ` · ${ subject.due_count } due` }
      </Typography>
      <SubjectControls
        subject={ subject }
        onEnrollAll={ ( enrolled ) => enrollSubject.mutate( { id: subject.id, enrolled } ) }
        onUpdate={ ( body ) => updateSubject.mutate( { id: subject.id, body } ) }
      />
      { changeError !== null && <Alert severity="error">{ changeError }</Alert> }
      <Divider />
      { notes.length === 0 && (
        <Typography color="text.secondary">No notes in this folder yet.</Typography>
      ) }
      <Stack divider={ <Divider flexItem /> }>
        { notes.map( ( note ) => (
          <MeleteNoteRow
            key={ note.id }
            note={ note }
            onEnrolledChange={ ( enrolled ) => setNoteEnrolled.mutate( { id: note.id, enrolled } ) }
            onRetry={ () => retryGeneration.mutate( note.id ) }
          />
        ) ) }
      </Stack>
    </Stack>
  )
}
