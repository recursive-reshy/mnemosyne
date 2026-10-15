// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { Navigate, useNavigate, useParams } from 'react-router'
// Shared
import { Job } from '@mnemosyne/shared'
// App
import { createJob } from '#src/api/jobs.api'
import { useJob } from '#src/hooks/useJob'
import { DownloadLinks } from '../DownloadLinks'
import { JobProgress } from '../JobProgress'

const DOWNLOADABLE_STATUSES: Job[ 'status' ][] = [ 'ready_for_review', 'summary_failed' ]

export function JobPage(): ReactElement {
  const navigate = useNavigate()
  const { id } = useParams()
  const parsedId = Job.shape.id.safeParse( id )
  const { job, error } = useJob( parsedId.success ? parsedId.data : null )
  const [ submitError, setSubmitError ] = useState< string | null >( null )

  if( !parsedId.success ) {
    return <Navigate to="/" replace />
  }

  const handleStartOver = (): void => {
    void navigate( '/' )
  }

  const handleRetry = async ( url: string ): Promise< void > => {
    setSubmitError( null )

    try {
      const newJobId = await createJob( url )

      void navigate( `/jobs/${ newJobId }` )
    } catch( caught ) {
      setSubmitError( caught instanceof Error ? caught.message : 'Unexpected error' )
    }
  }

  if( job === null && error !== null ) {
    return (
      <>
        <p className="alert" role="alert">{ error }</p>
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
        onRetry={ () => void handleRetry( job.url ) }
      />
      { DOWNLOADABLE_STATUSES.includes( job.status ) && <DownloadLinks jobId={ job.id } /> }
      { submitError && <p className="alert" role="alert">{ submitError }</p> }
      <button type="button" onClick={ handleStartOver }>Transcribe another video</button>
    </>
  )
}
