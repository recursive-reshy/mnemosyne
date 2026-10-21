// Packages
import { z } from 'zod'
// Shared
import { Job, SourceDocument } from '@mnemosyne/shared'
// Lifecycle
import { statusesWhere } from '../jobs/lifecycle.js'
// Repositories
import { getDatabase } from './database.js'

export const StoredJob = Job.omit( { summary_usage: true, link_usage: true } ).extend( {
  source_document: SourceDocument.nullable(),
} )
export type StoredJob = z.infer< typeof StoredJob >

const JobRow = z.object( {
  id: z.string(),
  url: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  title: z.string().nullable(),
  source_document: z.string().nullable(),
  note_markdown: z.string().nullable(),
  target_folder: z.string().nullable(),
  summary_model: z.string().nullable(),
  prompt_profile_id: z.string().nullable(),
  link_state: z.string().nullable(),
  link_error: z.string().nullable(),
  source_type: z.string(),
  feed_id: z.string().nullable(),
  feed_name: z.string().nullable(),
  gmail_source_id: z.string().nullable(),
  gmail_source_name: z.string().nullable(),
  saved_path: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
} )

const SELECT_JOB = `SELECT jobs.*, feeds.name AS feed_name,
    gmail_sources.name AS gmail_source_name
  FROM jobs
    LEFT JOIN feeds ON feeds.id = jobs.feed_id
    LEFT JOIN gmail_sources ON gmail_sources.id = jobs.gmail_source_id`

// Statuses are bound parameters, never concatenated into the SQL
const marks = ( statuses: string[] ): string => statuses.map( () => '?' ).join( ', ' )

const toStoredJob = ( raw: unknown ): StoredJob => {
  const row = JobRow.parse( raw )

  return StoredJob.parse( {
    ...row,
    source_document: row.source_document === null
      ? null
      : JSON.parse( row.source_document ) as unknown,
  } )
}

const toRow = ( job: StoredJob ): Record< string, string | null > => {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    error: job.error,
    title: job.title,
    source_document: job.source_document === null ? null : JSON.stringify( job.source_document ),
    note_markdown: job.note_markdown,
    target_folder: job.target_folder,
    summary_model: job.summary_model,
    prompt_profile_id: job.prompt_profile_id,
    link_state: job.link_state,
    link_error: job.link_error,
    source_type: job.source_type,
    feed_id: job.feed_id,
    gmail_source_id: job.gmail_source_id,
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
      id, url, status, error, title, source_document, note_markdown, target_folder,
      summary_model, prompt_profile_id, link_state, link_error, source_type, feed_id,
      gmail_source_id, saved_path, expires_at, created_at, updated_at
    ) VALUES (
      @id, @url, @status, @error, @title, @source_document, @note_markdown, @target_folder,
      @summary_model, @prompt_profile_id, @link_state, @link_error, @source_type, @feed_id,
      @gmail_source_id, @saved_path, @expires_at, @created_at, @updated_at
    )` ).run( toRow( job ) )
}

export const findJobById = ( id: string ): StoredJob | undefined => {
  const row = getDatabase().prepare( `${ SELECT_JOB } WHERE jobs.id = ?` ).get( id )

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
      source_document = @source_document, note_markdown = @note_markdown,
      target_folder = @target_folder, summary_model = @summary_model,
      prompt_profile_id = @prompt_profile_id, link_state = @link_state,
      link_error = @link_error, source_type = @source_type,
      feed_id = @feed_id, gmail_source_id = @gmail_source_id, saved_path = @saved_path,
      expires_at = @expires_at, created_at = @created_at, updated_at = @updated_at
    WHERE id = @id` ).run( toRow( updated ) )

  return updated
}

export const findNextRunnableJob = (): StoredJob | undefined => {
  const statuses = statusesWhere( 'runnable' )
  const row = getDatabase()
    .prepare( `${ SELECT_JOB } WHERE jobs.status IN ( ${ marks( statuses ) } )
      ORDER BY jobs.rowid LIMIT 1` )
    .get( ...statuses )

  return row === undefined ? undefined : toStoredJob( row )
}

export const clearJobs = (): void => {
  getDatabase().exec( 'DELETE FROM jobs' )
}

export const markInterruptedJobs = ( message: string, now: string ): number => {
  const statuses = statusesWhere( 'onRestart', 'failed' )
  const { changes } = getDatabase()
    .prepare( `UPDATE jobs SET status = 'failed', error = ?, updated_at = ?
      WHERE status IN ( ${ marks( statuses ) } )` )
    .run( message, now, ...statuses )

  return changes
}

export const markInterruptedLinkingJobs = (
  message: string,
  now: string,
  expiresAt: string,
): number => {
  const statuses = statusesWhere( 'onRestart', 'ready_for_review' )
  const { changes } = getDatabase()
    .prepare( `UPDATE jobs SET status = 'ready_for_review', link_state = 'failed',
        link_error = ?, expires_at = ?, updated_at = ?
      WHERE status IN ( ${ marks( statuses ) } )` )
    .run( message, expiresAt, now, ...statuses )

  return changes
}

export const listActiveJobs = (): StoredJob[] => {
  const statuses = statusesWhere( 'active' )

  return getDatabase()
    .prepare( `${ SELECT_JOB }
      WHERE jobs.status IN ( ${ marks( statuses ) } )
      ORDER BY jobs.created_at DESC, jobs.rowid DESC` )
    .all( ...statuses )
    .map( toStoredJob )
}

export const deleteJob = ( id: string ): boolean => {
  const db = getDatabase()

  return db.transaction( () => {
    db.prepare( 'DELETE FROM link_suggestions WHERE job_id = ?' ).run( id )
    db.prepare( 'DELETE FROM link_runs WHERE job_id = ?' ).run( id )

    return db.prepare( 'DELETE FROM jobs WHERE id = ?' ).run( id ).changes > 0
  } )()
}

export const findExpiredJobs = ( now: string ): StoredJob[] => {
  const statuses = statusesWhere( 'expires' )

  return getDatabase()
    .prepare( `${ SELECT_JOB }
      WHERE jobs.status IN ( ${ marks( statuses ) } )
        AND jobs.expires_at IS NOT NULL AND jobs.expires_at <= ?` )
    .all( ...statuses, now )
    .map( toStoredJob )
}
