// Packages
import { z } from 'zod'
// Shared
import { MeleteGeneration } from '@mnemosyne/shared'
// Repositories
import { getDatabase } from './database.js'

const Flag = z.int().transform( ( value ) => value === 1 )

export const NoteRecord = z.object( {
  id: z.string(),
  subject_id: z.string(),
  path: z.string(),
  title: z.string(),
  body_hash: z.string(),
  mtime_ms: z.number(),
  size: z.int(),
  enrolled: Flag,
  enrolled_at: z.string().nullable(),
  generation: MeleteGeneration,
  generation_error: z.string().nullable(),
  missing_at: z.string().nullable(),
  created_at: z.string(),
} )
export type NoteRecord = z.infer< typeof NoteRecord >

export type NewNote = Pick<
  NoteRecord,
  'subject_id' | 'path' | 'title' | 'body_hash' | 'mtime_ms' | 'size' | 'enrolled'
  | 'enrolled_at' | 'generation'
>

const UPDATABLE = [
  'path',
  'subject_id',
  'title',
  'body_hash',
  'mtime_ms',
  'size',
  'enrolled_at',
  'generation',
  'generation_error',
  'missing_at',
] as const

export type NoteChanges = Partial< Pick< NoteRecord, typeof UPDATABLE[ number ] > >

const placeholders = ( values: readonly unknown[] ): string => values.map( () => '?' ).join( ', ' )

const parseRows = ( rows: unknown[] ): NoteRecord[] => z.array( NoteRecord ).parse( rows )

export const findNote = ( id: string ): NoteRecord | undefined => {
  const row = getDatabase().prepare( 'SELECT * FROM melete_notes WHERE id = ?' ).get( id )

  return row === undefined ? undefined : NoteRecord.parse( row )
}

export const insertNote = ( note: NewNote ): NoteRecord => {
  const id = crypto.randomUUID()

  getDatabase()
    .prepare( `INSERT INTO melete_notes (
        id, subject_id, path, title, body_hash, mtime_ms, size, enrolled, enrolled_at,
        generation, created_at
      ) VALUES (
        @id, @subject_id, @path, @title, @body_hash, @mtime_ms, @size, @enrolled, @enrolled_at,
        @generation, @created_at
      )` )
    .run( {
      ...note,
      id,
      enrolled: note.enrolled ? 1 : 0,
      created_at: new Date().toISOString(),
    } )

  const inserted = findNote( id )

  if( inserted === undefined ) {
    throw new Error( `Melete note ${ id } was not stored` )
  }

  return inserted
}

export const listNotesBySubject = ( subjectId: string ): NoteRecord[] => {
  return parseRows( getDatabase()
    .prepare( 'SELECT * FROM melete_notes WHERE subject_id = ? ORDER BY path' )
    .all( subjectId ) )
}

// A path range instead of LIKE, so % and _ in folder names are plain characters ('0' follows '/')
export const listNotesUnder = ( folderPrefix: string ): NoteRecord[] => {
  return parseRows( getDatabase()
    .prepare( 'SELECT * FROM melete_notes WHERE path >= ? AND path < ? ORDER BY path' )
    .all( `${ folderPrefix }/`, `${ folderPrefix }0` ) )
}

export const updateNote = ( id: string, changes: NoteChanges ): NoteRecord | undefined => {
  const columns = UPDATABLE.filter( ( column ) => changes[ column ] !== undefined )

  if( columns.length > 0 ) {
    getDatabase()
      .prepare( `UPDATE melete_notes
        SET ${ columns.map( ( column ) => `${ column } = @${ column }` ).join( ', ' ) }
        WHERE id = @id` )
      .run( { ...Object.fromEntries( columns.map( ( c ) => [ c, changes[ c ] ] ) ), id } )
  }

  return findNote( id )
}

export const findMissingByHash = ( hash: string ): NoteRecord[] => {
  return parseRows( getDatabase()
    .prepare( 'SELECT * FROM melete_notes WHERE missing_at IS NOT NULL AND body_hash = ?' )
    .all( hash ) )
}

// Unenrolling keeps enrolled_at, so enrolling again goes back to its old place in the queue
export const setEnrolled = ( ids: string[], enrolled: boolean, at: string ): void => {
  if( ids.length === 0 ) {
    return
  }

  getDatabase()
    .prepare( enrolled
      ? `UPDATE melete_notes SET enrolled = 1, enrolled_at = ?
        WHERE id IN ( ${ placeholders( ids ) } )`
      : `UPDATE melete_notes SET enrolled = 0 WHERE id IN ( ${ placeholders( ids ) } )` )
    .run( ...( enrolled ? [ at, ...ids ] : ids ) )
}

export const claimNextQueued = (): NoteRecord | undefined => {
  const row = getDatabase()
    .prepare( `UPDATE melete_notes SET generation = 'generating'
      WHERE id = (
        SELECT id FROM melete_notes WHERE generation = 'queued'
        ORDER BY enrolled_at, rowid LIMIT 1
      ) RETURNING *` )
    .get()

  return row === undefined ? undefined : NoteRecord.parse( row )
}

export const requeueGenerating = (): number => {
  return getDatabase()
    .prepare( 'UPDATE melete_notes SET generation = \'queued\' WHERE generation = \'generating\'' )
    .run().changes
}
