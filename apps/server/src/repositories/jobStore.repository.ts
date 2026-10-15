// Packages
import Database from 'better-sqlite3'
import { z } from 'zod'
// Shared
import { Job, Transcript } from '@mnemosyne/shared'

export const StoredJob = Job.extend( {
  transcript: Transcript.nullable(),
} )
export type StoredJob = z.infer< typeof StoredJob >

export const jobStoreMigrations: string[] = [
  `CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    title TEXT,
    transcript TEXT,
    summary_markdown TEXT,
    suggested_tags TEXT NOT NULL DEFAULT '[]',
    saved_path TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
]

let database: Database.Database | undefined

export const openJobStore = ( path: string ): void => {
  closeJobStore()

  const opened = new Database( path )
  opened.pragma( 'journal_mode = WAL' )

  const applied = z.number().parse( opened.pragma( 'user_version', { simple: true } ) )

  opened.transaction( () => {
    for( const [ index, migration ] of jobStoreMigrations.entries() ) {
      if( index >= applied ) {
        opened.exec( migration )
        opened.pragma( `user_version = ${ index + 1 }` )
      }
    }
  } )()

  database = opened
}

export const closeJobStore = (): void => {
  database?.close()
  database = undefined
}

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
