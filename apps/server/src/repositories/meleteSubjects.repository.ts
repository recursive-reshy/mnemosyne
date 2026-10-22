// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

const Flag = z.int().transform( ( value ) => value === 1 )

export const SubjectRecord = z.object( {
  id: z.string(),
  folder: z.string(),
  auto_enroll: Flag,
  new_per_day: z.int(),
  created_at: z.string(),
} )
export type SubjectRecord = z.infer< typeof SubjectRecord >

export type SubjectChanges = { auto_enroll?: boolean, new_per_day?: number }

export const findSubject = ( id: string ): SubjectRecord | undefined => {
  const row = getDatabase().prepare( 'SELECT * FROM melete_subjects WHERE id = ?' ).get( id )

  return row === undefined ? undefined : SubjectRecord.parse( row )
}

export const listSubjects = (): SubjectRecord[] => {
  return z.array( SubjectRecord ).parse( getDatabase()
    .prepare( 'SELECT * FROM melete_subjects ORDER BY lower( folder ), folder' )
    .all() )
}

export const upsertSubject = ( folder: string ): SubjectRecord => {
  const db = getDatabase()

  return db.transaction( () => {
    db.prepare( `INSERT INTO melete_subjects ( id, folder, created_at ) VALUES ( ?, ?, ? )
      ON CONFLICT ( folder ) DO NOTHING` )
      .run( crypto.randomUUID(), folder, new Date().toISOString() )

    return SubjectRecord.parse(
      db.prepare( 'SELECT * FROM melete_subjects WHERE folder = ?' ).get( folder ),
    )
  } )()
}

export const updateSubject = ( id: string, changes: SubjectChanges ): SubjectRecord | undefined => {
  const db = getDatabase()

  if( changes.auto_enroll !== undefined ) {
    db.prepare( 'UPDATE melete_subjects SET auto_enroll = ? WHERE id = ?' )
      .run( changes.auto_enroll ? 1 : 0, id )
  }

  if( changes.new_per_day !== undefined ) {
    db.prepare( 'UPDATE melete_subjects SET new_per_day = ? WHERE id = ?' )
      .run( changes.new_per_day, id )
  }

  return findSubject( id )
}
