// Packages
import Database from 'better-sqlite3'
import { z } from 'zod'
// Shared
import {
  Job,
  Transcript,
  applyLockedProperties,
  formatClock,
  serializeNote,
} from '@mnemosyne/shared'

export const StoredJob = Job.extend( {
  transcript: Transcript.nullable(),
} )
export type StoredJob = z.infer< typeof StoredJob >

const addNoteColumns = ( db: Database.Database ): void => {
  db.exec( 'ALTER TABLE jobs ADD COLUMN note_markdown TEXT' )
  db.exec( 'ALTER TABLE jobs ADD COLUMN target_folder TEXT' )

  const rows = z.array( z.object( {
    id: z.string(),
    title: z.string().nullable(),
    transcript: z.string().nullable(),
    summary_markdown: z.string().nullable(),
    suggested_tags: z.string(),
  } ) ).parse( db.prepare( `SELECT id, title, transcript, summary_markdown, suggested_tags
    FROM jobs WHERE status = 'ready_for_review'` ).all() )
  const created = new Date().toISOString().slice( 0, 10 )
  const update = db.prepare( 'UPDATE jobs SET note_markdown = ? WHERE id = ?' )

  for( const row of rows ) {
    const meta = row.transcript === null
      ? undefined
      : Transcript.parse( JSON.parse( row.transcript ) ).meta
    const tags = z.array( z.string() ).parse( JSON.parse( row.suggested_tags ) )

    const note = applyLockedProperties(
      {
        properties: {
          title: row.title ?? meta?.title ?? '',
          source: '',
          channel: '',
          duration: '',
          created,
          tags,
        },
        body: `${ ( row.summary_markdown ?? '' ).trim() }\n`,
      },
      {
        source: meta?.source ?? '',
        channel: meta?.channel ?? '',
        duration: formatClock( meta?.duration_seconds ?? 0 ),
        created,
      },
    )

    update.run( serializeNote( note ), row.id )
  }
}

export type Migration = string | ( ( db: Database.Database ) => void )

export const jobStoreMigrations: Migration[] = [
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
  addNoteColumns,
  `ALTER TABLE jobs DROP COLUMN summary_markdown;
  ALTER TABLE jobs DROP COLUMN suggested_tags;`,
]

let database: Database.Database | undefined

export const runMigrations = ( db: Database.Database, migrations: Migration[] ): void => {
  const applied = z.number().parse( db.pragma( 'user_version', { simple: true } ) )

  db.transaction( () => {
    for( const [ index, migration ] of migrations.entries() ) {
      if( index >= applied ) {
        if( typeof migration === 'string' ) {
          db.exec( migration )
        } else {
          migration( db )
        }

        db.pragma( `user_version = ${ index + 1 }` )
      }
    }
  } )()
}

export const openJobStore = ( path: string ): void => {
  closeJobStore()

  const opened = new Database( path )
  opened.pragma( 'journal_mode = WAL' )

  runMigrations( opened, jobStoreMigrations )

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
  note_markdown: z.string().nullable(),
  target_folder: z.string().nullable(),
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

  // The two fields go from the Job contract in task 8.2.
  return StoredJob.parse( {
    ...row,
    summary_markdown: null,
    suggested_tags: [],
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
  const db = requireDatabase()

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
      transcript = @transcript, note_markdown = @note_markdown,
      target_folder = @target_folder, saved_path = @saved_path,
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

export const listActiveJobs = (): StoredJob[] => {
  return requireDatabase()
    .prepare( `SELECT * FROM jobs
      WHERE status NOT IN ( 'failed', 'saved' )
      ORDER BY created_at DESC, rowid DESC` )
    .all()
    .map( toStoredJob )
}

export const deleteJob = ( id: string ): boolean => {
  const { changes } = requireDatabase().prepare( 'DELETE FROM jobs WHERE id = ?' ).run( id )

  return changes > 0
}

export const findExpiredJobs = ( now: string ): StoredJob[] => {
  return requireDatabase()
    .prepare( `SELECT * FROM jobs
      WHERE status IN ( 'ready_for_review', 'summary_failed' )
        AND expires_at IS NOT NULL AND expires_at <= ?` )
    .all( now )
    .map( toStoredJob )
}
