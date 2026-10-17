// Packages
import Database from 'better-sqlite3'
import { z } from 'zod'
// Shared
import {
  Transcript,
  applyLockedProperties,
  formatClock,
  serializeNote,
} from '@mnemosyne/shared'
// Summarizer
import { SEEDED_PROFILES } from '../summarizer/prompts.js'

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

const addSummarizerTables = ( db: Database.Database ): void => {
  db.exec( `CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE prompt_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    seed_key TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX prompt_profiles_active_name
    ON prompt_profiles ( lower( name ) ) WHERE deleted_at IS NULL;
  CREATE TABLE prompt_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES prompt_profiles ( id ),
    version INTEGER NOT NULL,
    guidance TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE ( profile_id, version )
  );
  CREATE TABLE summary_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL,
    outcome TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX summary_runs_job ON summary_runs ( job_id, id );
  ALTER TABLE jobs ADD COLUMN summary_model TEXT;
  ALTER TABLE jobs ADD COLUMN prompt_profile_id TEXT;` )

  const now = new Date().toISOString()
  const insertProfile = db.prepare( `INSERT INTO prompt_profiles ( id, name, seed_key, created_at )
    VALUES ( ?, ?, ?, ? )` )
  const insertVersion = db.prepare( `INSERT INTO prompt_versions
    ( profile_id, version, guidance, source, created_at ) VALUES ( ?, 1, ?, 'seed', ? )` )
  let businessId = ''

  for( const profile of SEEDED_PROFILES ) {
    const id = crypto.randomUUID()

    insertProfile.run( id, profile.name, profile.seedKey, now )
    insertVersion.run( id, profile.guidance, now )

    if( profile.seedKey === 'business' ) {
      businessId = id
    }
  }

  db.prepare( 'INSERT INTO settings ( key, value ) VALUES ( ?, ? )' )
    .run( 'default_profile_id', JSON.stringify( businessId ) )
}

export type Migration = string | ( ( db: Database.Database ) => void )

export const migrations: Migration[] = [
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
  addSummarizerTables,
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

export const openDatabase = ( path: string ): void => {
  closeDatabase()

  const opened = new Database( path )
  opened.pragma( 'journal_mode = WAL' )

  runMigrations( opened, migrations )

  database = opened
}

export const closeDatabase = (): void => {
  database?.close()
  database = undefined
}

export const getDatabase = (): Database.Database => {
  if( database === undefined ) {
    throw new Error( 'Database is not open' )
  }

  return database
}
