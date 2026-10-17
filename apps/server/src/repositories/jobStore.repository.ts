// Packages
import { z } from 'zod'
// Shared
import { Job, Transcript } from '@mnemosyne/shared'
// Repositories
import { getDatabase } from './database.js'

export const StoredJob = Job.omit( { summary_usage: true } ).extend( {
  transcript: Transcript.nullable(),
} )
export type StoredJob = z.infer< typeof StoredJob >

const JobRow = z.object( {
  id: z.string(),
  url: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  title: z.string().nullable(),
  transcript: z.string().nullable(),
  note_markdown: z.string().nullable(),
  target_folder: z.string().nullable(),
  saved_path: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
} )

const toStoredJob = ( raw: unknown ): StoredJob => {
  const row = JobRow.parse( raw )

  return StoredJob.parse( {
    ...row,
    summary_model: null,
    prompt_profile_id: null,
    transcript: row.transcript === null ? null : JSON.parse( row.transcript ) as unknown,
  } )
}

const toRow = ( job: StoredJob ): Record< string, string | null > => {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    error: job.error,
    title: job.title,
    transcript: job.transcript === null ? null : JSON.stringify( job.transcript ),
    note_markdown: job.note_markdown,
    target_folder: job.target_folder,
    saved_path: job.saved_path,
    expires_at: job.expires_at,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }
}

export const insertJob = ( job: StoredJob ): void => {
  const db = getDatabase()

  if( db.prepare( 'SELECT 1 FROM jobs WHERE id = ?' ).get( job.id ) !== undefined ) {
    throw new Error( `Job ${ job.id } already exists` )
  }

  db.prepare( `INSERT INTO jobs (
      id, url, status, error, title, transcript, note_markdown, target_folder,
      saved_path, expires_at, created_at, updated_at
    ) VALUES (
      @id, @url, @status, @error, @title, @transcript, @note_markdown, @target_folder,
      @saved_path, @expires_at, @created_at, @updated_at
    )` ).run( toRow( job ) )
}

export const findJobById = ( id: string ): StoredJob | undefined => {
  const row = getDatabase().prepare( 'SELECT * FROM jobs WHERE id = ?' ).get( id )

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

  getDatabase().prepare( `UPDATE jobs SET
      url = @url, status = @status, error = @error, title = @title,
      transcript = @transcript, note_markdown = @note_markdown,
      target_folder = @target_folder, saved_path = @saved_path,
      expires_at = @expires_at, created_at = @created_at, updated_at = @updated_at
    WHERE id = @id` ).run( toRow( updated ) )

  return updated
}

export const findNextRunnableJob = (): StoredJob | undefined => {
  const row = getDatabase()
    .prepare( `SELECT * FROM jobs WHERE status IN ( 'queued', 'summarizing' )
      ORDER BY rowid LIMIT 1` )
    .get()

  return row === undefined ? undefined : toStoredJob( row )
}

export const clearJobs = (): void => {
  getDatabase().exec( 'DELETE FROM jobs' )
}

export const markInterruptedJobs = ( message: string, now: string ): number => {
  const { changes } = getDatabase()
    .prepare( `UPDATE jobs SET status = 'failed', error = ?, updated_at = ?
      WHERE status IN ( 'downloading', 'converting', 'transcribing' )` )
    .run( message, now )

  return changes
}

export const listActiveJobs = (): StoredJob[] => {
  return getDatabase()
    .prepare( `SELECT * FROM jobs
      WHERE status NOT IN ( 'failed', 'saved' )
      ORDER BY created_at DESC, rowid DESC` )
    .all()
    .map( toStoredJob )
}

export const deleteJob = ( id: string ): boolean => {
  const { changes } = getDatabase().prepare( 'DELETE FROM jobs WHERE id = ?' ).run( id )

  return changes > 0
}

export const findExpiredJobs = ( now: string ): StoredJob[] => {
  return getDatabase()
    .prepare( `SELECT * FROM jobs
      WHERE status IN ( 'ready_for_review', 'summary_failed' )
        AND expires_at IS NOT NULL AND expires_at <= ?` )
    .all( now )
    .map( toStoredJob )
}
