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

const JobRow = z.object( {
  id: z.string(),
  url: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  title: z.string().nullable(),
  transcript: z.string().nullable(),
  summary_markdown: z.string().nullable(),
  suggested_tags: z.string(),
  saved_path: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
} )

const requireDatabase = (): Database.Database => {
  if( database === undefined ) {
    throw new Error( 'Job store is not open' )
  }

  return database
}

const toStoredJob = ( raw: unknown ): StoredJob => {
  const row = JobRow.parse( raw )

  return StoredJob.parse( {
    ...row,
    suggested_tags: JSON.parse( row.suggested_tags ) as unknown,
    transcript: row.transcript === null ? null : JSON.parse( row.transcript ) as unknown,
  } )
}

const toRow = ( job: StoredJob ): Record< string, string | null > => {
  return {
    ...job,
    suggested_tags: JSON.stringify( job.suggested_tags ),
    transcript: job.transcript === null ? null : JSON.stringify( job.transcript ),
  }
}

export const insertJob = ( job: StoredJob ): void => {
  const db = requireDatabase()

  if( db.prepare( 'SELECT 1 FROM jobs WHERE id = ?' ).get( job.id ) !== undefined ) {
    throw new Error( `Job ${ job.id } already exists` )
  }

  db.prepare( `INSERT INTO jobs (
      id, url, status, error, title, transcript, summary_markdown,
      suggested_tags, saved_path, expires_at, created_at, updated_at
    ) VALUES (
      @id, @url, @status, @error, @title, @transcript, @summary_markdown,
      @suggested_tags, @saved_path, @expires_at, @created_at, @updated_at
    )` ).run( toRow( job ) )
}

export const findJobById = ( id: string ): StoredJob | undefined => {
  const row = requireDatabase().prepare( 'SELECT * FROM jobs WHERE id = ?' ).get( id )

  return row === undefined ? undefined : toStoredJob( row )
}

export const updateJob = (
  id: string,
  changes: Partial< Omit< StoredJob, 'id' > >,
): StoredJob | undefined => {
  const job = findJobById( id )

  if( job === undefined ) {
    return undefined
  }

  const updated: StoredJob = { ...job, ...changes }

  requireDatabase().prepare( `UPDATE jobs SET
      url = @url, status = @status, error = @error, title = @title,
      transcript = @transcript, summary_markdown = @summary_markdown,
      suggested_tags = @suggested_tags, saved_path = @saved_path,
      expires_at = @expires_at, created_at = @created_at, updated_at = @updated_at
    WHERE id = @id` ).run( toRow( updated ) )

  return updated
}

export const findNextRunnableJob = (): StoredJob | undefined => {
  const row = requireDatabase()
    .prepare( `SELECT * FROM jobs WHERE status IN ( 'queued', 'summarizing' )
      ORDER BY rowid LIMIT 1` )
    .get()

  return row === undefined ? undefined : toStoredJob( row )
}

export const clearJobs = (): void => {
  requireDatabase().exec( 'DELETE FROM jobs' )
}

export const markInterruptedJobs = ( message: string, now: string ): number => {
  const { changes } = requireDatabase()
    .prepare( `UPDATE jobs SET status = 'failed', error = ?, updated_at = ?
      WHERE status IN ( 'downloading', 'converting', 'transcribing' )` )
    .run( message, now )

  return changes
}
