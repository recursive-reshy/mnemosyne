// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { useNavigate } from 'react-router'
// App
import { createJob } from '#src/api/jobs.api'
import { SubmitForm } from '../SubmitForm'

export function HomePage(): ReactElement {
  const navigate = useNavigate()
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
    <SubmitForm
      isSubmitting={ isSubmitting }
      error={ submitError }
      onSubmit={ ( url ) => void handleSubmit( url ) }
    />
  )
}
