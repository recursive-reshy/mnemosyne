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
  STUDY_GUIDANCE,
  STUDY_SEED_KEY,
} from '../summarizer/prompts.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  MELETE_GRADING_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
} from '../melete/prompts.js'

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

  // Study arrives with migration 9; this migration stays as it shipped
  for( const profile of SEEDED_PROFILES.filter( ( { seedKey } ) => seedKey !== STUDY_SEED_KEY ) ) {
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

type SeedProfile = {
  name: string
  seedKey: string
  purpose: string
  guidance: string
}

const seedProfile = ( db: Database.Database, profile: SeedProfile ): void => {
  const exists = db.prepare( 'SELECT 1 FROM prompt_profiles WHERE seed_key = ?' )
    .get( profile.seedKey )

  if( exists !== undefined ) {
    return
  }

  const taken = db.prepare( `SELECT 1 FROM prompt_profiles
    WHERE purpose = ? AND lower( name ) = lower( ? ) AND deleted_at IS NULL` )
    .get( profile.purpose, profile.name )
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const name = taken === undefined ? profile.name : `${ profile.name } (seeded)`

  db.prepare( `INSERT INTO prompt_profiles ( id, name, seed_key, purpose, created_at )
    VALUES ( ?, ?, ?, ?, ? )` )
    .run( id, name, profile.seedKey, profile.purpose, now )
  db.prepare( `INSERT INTO prompt_versions
    ( profile_id, version, guidance, source, created_at ) VALUES ( ?, 1, ?, 'seed', ? )` )
    .run( id, profile.guidance, now )
}

const addMelete = ( db: Database.Database ): void => {
  db.exec( `CREATE TABLE melete_subjects (
    id TEXT PRIMARY KEY,
    folder TEXT NOT NULL UNIQUE,
    auto_enroll INTEGER NOT NULL DEFAULT 0,
    new_per_day INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL
  );

  CREATE TABLE melete_notes (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL REFERENCES melete_subjects ( id ),
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    mtime_ms INTEGER NOT NULL,
    size INTEGER NOT NULL,
    enrolled INTEGER NOT NULL DEFAULT 0,
    enrolled_at TEXT,
    generation TEXT NOT NULL DEFAULT 'idle',
    generation_error TEXT,
    missing_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX melete_notes_path ON melete_notes ( path ) WHERE missing_at IS NULL;
  CREATE INDEX melete_notes_hash ON melete_notes ( body_hash );
  CREATE INDEX melete_notes_queue ON melete_notes ( generation, enrolled_at );

  CREATE TABLE melete_questions (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES melete_notes ( id ),
    position INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    passage TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    state TEXT NOT NULL,
    run_id INTEGER NOT NULL,
    due TEXT,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    fsrs_state TEXT NOT NULL DEFAULT 'new',
    last_review TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX melete_questions_note ON melete_questions ( note_id, state, position );
  CREATE INDEX melete_questions_due ON melete_questions ( state, due );

  CREATE TABLE melete_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL REFERENCES melete_questions ( id ),
    reviewed_at TEXT NOT NULL,
    mode TEXT NOT NULL,
    rating TEXT NOT NULL,
    suggested_rating TEXT,
    answer TEXT,
    grade_run_id INTEGER,
    was_new INTEGER NOT NULL,
    before_state TEXT NOT NULL
  );
  CREATE INDEX melete_reviews_question ON melete_reviews ( question_id, reviewed_at );
  CREATE INDEX melete_reviews_day ON melete_reviews ( reviewed_at );

  CREATE TABLE melete_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    note_id TEXT,
    question_id TEXT,
    model TEXT NOT NULL,
    prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions ( id ),
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL,
    outcome TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX melete_runs_note ON melete_runs ( note_id, id );

  ALTER TABLE prompt_profiles ADD COLUMN last_folder TEXT;` )

  seedProfile( db, {
    name: 'Study',
    seedKey: STUDY_SEED_KEY,
    purpose: 'summary',
    guidance: STUDY_GUIDANCE,
  } )
  seedProfile( db, {
    name: 'Melete questions',
    seedKey: MELETE_QUESTIONS_SEED_KEY,
    purpose: 'melete_questions',
    guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  } )
  seedProfile( db, {
    name: 'Melete grading',
    seedKey: MELETE_GRADING_SEED_KEY,
    purpose: 'melete_grading',
    guidance: DEFAULT_MELETE_GRADING_GUIDANCE,
  } )
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
  addMelete,
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
  const stored = z.number().parse( opened.pragma( 'user_version', { simple: true } ) )

  // Checked before anything is written, so a refused file is left exactly as it was.
  if( stored > migrations.length ) {
    opened.close()

    throw new Error(
      `This database is from a newer version of Mnemosyne (schema ${ stored }, `
      + `this version knows ${ migrations.length }). `
      + 'Restore an older backup or upgrade the app.',
    )
  }

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
