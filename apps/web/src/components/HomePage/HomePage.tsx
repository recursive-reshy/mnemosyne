// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { useLocation, useNavigate } from 'react-router'
// App
import { createJob } from '#src/api/jobs.api'
import { useJobs } from '#src/hooks/useJobs'
import { JobList } from '../JobList'
import { SubmitForm } from '../SubmitForm'

const readSavedPath = ( state: unknown ): string | null => {
  if( typeof state !== 'object' || state === null || !( 'savedPath' in state ) ) {
    return null
  }

  return typeof state.savedPath === 'string' ? state.savedPath : null
}

export function HomePage(): ReactElement {
  const navigate = useNavigate()
  const savedPath = readSavedPath( useLocation().state )
  const { jobs, updatedAt } = useJobs()
  const [ isSubmitting, setIsSubmitting ] = useState( false )
  const [ submitError, setSubmitError ] = useState< string | null >( null )

  const handleSubmit = async ( url: string ): Promise< void > => {
    setIsSubmitting( true )
    setSubmitError( null )

    try {
      const jobId = await createJob( url )

      void navigate( `/jobs/${ jobId }` )
    } catch( caught ) {
      setSubmitError( caught instanceof Error ? caught.message : 'Unexpected error' )
    } finally {
      setIsSubmitting( false )
    }
  }

  return (
    <Stack spacing={ 2 } sx={ { width: '100%', maxWidth: '40rem' } }>
      { savedPath !== null && (
        <Alert severity="success" role="status">Saved to { savedPath }</Alert>
      ) }
      <SubmitForm
        isSubmitting={ isSubmitting }
        error={ submitError }
        onSubmit={ ( url ) => void handleSubmit( url ) }
      />
      <JobList jobs={ jobs ?? [] } now={ updatedAt } />
    </Stack>
  )
}
