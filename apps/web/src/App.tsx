// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Shared
import { Job } from '@mnemosyne/shared'
// App
import { createJob } from './api/jobs.api'
import { DownloadLinks } from './components/DownloadLinks'
import { JobProgress } from './components/JobProgress'
import { SubmitForm } from './components/SubmitForm'
import { useJob } from './hooks/useJob'

function readJobIdFromUrl(): string | null {
  const jobId = new URLSearchParams( window.location.search ).get( 'job' )
  const parsed = Job.shape.id.safeParse( jobId )

  if( !parsed.success ) {
    window.history.replaceState( null, '', window.location.pathname )
    return null
  }

  return parsed.data
}

function writeJobIdToUrl( jobId: string | null ): void {
  const search = jobId === null ? '' : `?job=${ encodeURIComponent( jobId ) }`

  window.history.replaceState( null, '', `${ window.location.pathname }${ search }` )
}

export function App(): ReactElement {
  const [ jobId, setJobId ] = useState< string | null >( readJobIdFromUrl )
  const [ isSubmitting, setIsSubmitting ] = useState( false )
  const [ submitError, setSubmitError ] = useState< string | null >( null )
  const { job, error } = useJob( jobId )

  async function handleSubmit( url: string ): Promise< void > {
    setIsSubmitting( true )
    setSubmitError( null )

    try {
      const createdId = await createJob( url )

      setJobId( createdId )
      writeJobIdToUrl( createdId )
    } catch( caught ) {
      setSubmitError( caught instanceof Error ? caught.message : 'Unexpected error' )
    } finally {
      setIsSubmitting( false )
    }
  }

  function handleStartOver(): void {
    setJobId( null )
    setSubmitError( null )
    writeJobIdToUrl( null )
  }

  function renderJob(): ReactElement {
    if( job === null && error !== null ) {
      return (
        <>
          <p role="alert">{ error }</p>
          <button type="button" onClick={ handleStartOver }>Start over</button>
        </>
      )
    }

    if( job === null ) {
      return <p role="status">Loading job…</p>
    }

    return (
      <>
        <JobProgress
          job={ job }
          connectionError={ error }
          onRetry={ () => void handleSubmit( job.url ) }
        />
        { job.status === 'done' && <DownloadLinks jobId={ job.id } /> }
        { submitError && <p role="alert">{ submitError }</p> }
        <button type="button" onClick={ handleStartOver }>Transcribe another video</button>
      </>
    )
  }

  return (
    <main>
      <h1>Mnemosyne</h1>
      { jobId === null
        ? (
          <SubmitForm
            isSubmitting={ isSubmitting }
            error={ submitError }
            onSubmit={ ( url ) => void handleSubmit( url ) }
          />
        )
        : renderJob() }
    </main>
  )
}
