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
import {
  DEFAULT_LINKER_GUIDANCE,
  LINKER_SEED_KEY,
  SEEDED_PROFILES,
} from '../summarizer/prompts.js'

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

const addSourcesAndFeeds = ( db: Database.Database ): void => {
  db.exec( `ALTER TABLE jobs RENAME COLUMN transcript TO source_document;
  UPDATE jobs SET source_document = json_set( source_document, '$.kind', 'video' )
    WHERE source_document IS NOT NULL;
  ALTER TABLE jobs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'video';
  ALTER TABLE jobs ADD COLUMN feed_id TEXT;

  CREATE TABLE feeds (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    feed_url TEXT NOT NULL,
    name TEXT NOT NULL,
    profile_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_summarize INTEGER NOT NULL DEFAULT 0,
    etag TEXT,
    last_modified TEXT,
    last_checked_at TEXT,
    last_error TEXT,
    last_skipped_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX feeds_active_url ON feeds ( feed_url ) WHERE deleted_at IS NULL;

  CREATE TABLE feed_items (
    id TEXT PRIMARY KEY,
    feed_id TEXT NOT NULL REFERENCES feeds ( id ),
    item_key TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    published_at TEXT,
    author TEXT,
    content_markdown TEXT,
    status TEXT NOT NULL,
    job_id TEXT,
    added_at TEXT NOT NULL,
    UNIQUE ( feed_id, item_key )
  );
  CREATE INDEX feed_items_inbox ON feed_items ( status, added_at );` )
}

const addGmailAndPostings = ( db: Database.Database ): void => {
  db.exec( `CREATE TABLE gmail_account (
    id INTEGER PRIMARY KEY CHECK ( id = 1 ),
    email TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    scope TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    connected_at TEXT NOT NULL
  );

  CREATE TABLE gmail_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    match_kind TEXT NOT NULL,
    label_ids TEXT,
    query TEXT,
    destination TEXT NOT NULL,
    profile_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_summarize INTEGER NOT NULL DEFAULT 0,
    sync_from TEXT NOT NULL,
    last_checked_at TEXT,
    last_error TEXT,
    last_skipped_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE gmail_messages (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES gmail_sources ( id ),
    message_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    sender TEXT NOT NULL,
    sender_address TEXT NOT NULL,
    received_at TEXT NOT NULL,
    body_html TEXT,
    body_text TEXT,
    status TEXT NOT NULL,
    backfilled INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    job_id TEXT,
    added_at TEXT NOT NULL,
    UNIQUE ( source_id, message_id )
  );
  CREATE INDEX gmail_messages_status ON gmail_messages ( status, added_at );

  CREATE TABLE job_postings (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    platform_job_id TEXT,
    dedupe_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    posted_at TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    details TEXT NOT NULL
  );
  CREATE INDEX job_postings_seen ON job_postings ( first_seen_at );

  CREATE TABLE posting_sightings (
    posting_id TEXT NOT NULL REFERENCES job_postings ( id ),
    gmail_message_row TEXT NOT NULL REFERENCES gmail_messages ( id ),
    seen_at TEXT NOT NULL,
    PRIMARY KEY ( posting_id, gmail_message_row )
  );

  CREATE TABLE extraction_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gmail_message_row TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL,
    outcome TEXT NOT NULL,
    postings_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );

  ALTER TABLE jobs ADD COLUMN gmail_source_id TEXT;` )
}

const addLinking = ( db: Database.Database ): void => {
  db.exec( `ALTER TABLE prompt_profiles ADD COLUMN purpose TEXT NOT NULL DEFAULT 'summary';
  DROP INDEX prompt_profiles_active_name;
  CREATE UNIQUE INDEX prompt_profiles_active_name
    ON prompt_profiles ( purpose, lower( name ) ) WHERE deleted_at IS NULL;

  CREATE TABLE link_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_input_tokens INTEGER,
    cache_creation_input_tokens INTEGER,
    tool_calls INTEGER,
    cost_usd REAL,
    outcome TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX link_runs_job ON link_runs ( job_id, id );

  CREATE TABLE link_suggestions (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    run_id INTEGER NOT NULL REFERENCES link_runs ( id ),
    position INTEGER NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    anchor TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    decided_at TEXT
  );
  CREATE INDEX link_suggestions_job ON link_suggestions ( job_id, status, position );

  ALTER TABLE jobs ADD COLUMN link_state TEXT;
  ALTER TABLE jobs ADD COLUMN link_error TEXT;` )

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare( `INSERT INTO prompt_profiles ( id, name, seed_key, purpose, created_at )
    VALUES ( ?, 'Linker', ?, 'linker', ? )` ).run( id, LINKER_SEED_KEY, now )
  db.prepare( `INSERT INTO prompt_versions
    ( profile_id, version, guidance, source, created_at ) VALUES ( ?, 1, ?, 'seed', ? )` )
    .run( id, DEFAULT_LINKER_GUIDANCE, now )
}

const carryOverChecks = ( db: Database.Database, table: string, kind: string ): void => {
  db.prepare( `INSERT INTO health_status (
      kind, subject_id, last_checked_at, last_success_at, last_error, failing_since
    )
    SELECT ?, id, last_checked_at,
      CASE WHEN last_error IS NULL THEN last_checked_at END,
      last_error,
      CASE WHEN last_error IS NOT NULL THEN last_checked_at END
    FROM ${ table }
    WHERE deleted_at IS NULL AND ( last_checked_at IS NOT NULL OR last_error IS NOT NULL )` )
    .run( kind )

  db.prepare( `INSERT INTO health_errors ( kind, subject_id, at, message )
    SELECT ?, id, COALESCE( last_checked_at, '' ), last_error
    FROM ${ table }
    WHERE deleted_at IS NULL AND last_error IS NOT NULL` )
    .run( kind )
}

const addHealth = ( db: Database.Database ): void => {
  db.exec( `CREATE TABLE health_status (
    kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    last_checked_at TEXT,
    last_success_at TEXT,
    last_error TEXT,
    failing_since TEXT,
    detail TEXT,
    PRIMARY KEY ( kind, subject_id )
  );
  CREATE TABLE health_errors (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    at TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX health_errors_subject ON health_errors ( kind, subject_id, at );` )

  carryOverChecks( db, 'feeds', 'feed' )
  carryOverChecks( db, 'gmail_sources', 'gmail_source' )

  db.exec( `ALTER TABLE feeds DROP COLUMN last_checked_at;
  ALTER TABLE feeds DROP COLUMN last_error;
  ALTER TABLE gmail_sources DROP COLUMN last_checked_at;
  ALTER TABLE gmail_sources DROP COLUMN last_error;` )
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
  addSourcesAndFeeds,
  addGmailAndPostings,
  addLinking,
  addHealth,
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

export const inTransaction = < Result >( work: () => Result ): Result => {
  return getDatabase().transaction( work )()
}
