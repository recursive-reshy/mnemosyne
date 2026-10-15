// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { useLocation, useNavigate } from 'react-router'
// App
import { createJob } from '#src/api/jobs.api'
import { useJobs } from '#src/hooks/useJobs'
import { JobList } from '../JobList'
import { SubmitForm } from '../SubmitForm'
import styles from './HomePage.module.css'

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
    <div className={ styles.home }>
      { savedPath !== null && (
        <p className={ styles.saved } role="status">Saved to { savedPath }</p>
      ) }
      <SubmitForm
        isSubmitting={ isSubmitting }
        error={ submitError }
        onSubmit={ ( url ) => void handleSubmit( url ) }
      />
      <JobList jobs={ jobs ?? [] } now={ updatedAt } />
    </div>
  )
}
