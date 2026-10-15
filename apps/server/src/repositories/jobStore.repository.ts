// Packages
import { z } from 'zod'
// Shared
import { Job, Transcript } from '@mnemosyne/shared'

export const StoredJob = Job.extend( {
  transcript: Transcript.nullable(),
} )
export type StoredJob = z.infer< typeof StoredJob >

const jobs = new Map< string, StoredJob >()

export const insertJob = ( job: StoredJob ): void => {
  if( jobs.has( job.id ) ) {
    throw new Error( `Job ${ job.id } already exists` )
  }

  jobs.set( job.id, structuredClone( job ) )
}

export const findJobById = ( id: string ): StoredJob | undefined => {
  const job = jobs.get( id )

  return job === undefined ? undefined : structuredClone( job )
}

export const updateJob = (
  id: string,
  changes: Partial< Omit< StoredJob, 'id' > >,
): StoredJob | undefined => {
  const job = jobs.get( id )

  if( job === undefined ) {
    return undefined
  }

  const updated: StoredJob = { ...job, ...structuredClone( changes ) }
  jobs.set( id, updated )

  return structuredClone( updated )
}

export const findNextQueuedJob = (): StoredJob | undefined => {
  for( const job of jobs.values() ) {
    if( job.status === 'queued' ) {
      return structuredClone( job )
    }
  }

  return undefined
}

export const clearJobs = (): void => {
  jobs.clear()
}
