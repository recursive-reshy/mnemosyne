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
