// Shared
import {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  MeleteNote,
  MeleteQuestion,
  MeleteSubject,
  UpdateMeleteSubjectBody,
} from '@mnemosyne/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Melete
import { listSubjectFolders } from '../melete/scan.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import {
  NoteRecord,
  findNote,
  listNotesBySubject,
  setEnrolled,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import {
  QuestionRecord,
  countBySubject,
  findQuestion,
  listForNote,
  retireActiveForNote,
  setState,
} from '../repositories/meleteQuestions.repository.js'
import {
  SubjectRecord,
  findSubject,
  listSubjects,
  updateSubject as updateStoredSubject,
} from '../repositories/meleteSubjects.repository.js'
// Services
import { scanLearningRoot } from './meleteScan.service.js'
import { getLearningRoot } from './settings.service.js'

const requireNote = ( id: string ): NoteRecord => {
  const note = findNote( id )

  if( note === undefined ) {
    throw new NotFoundError( 'Note not found' )
  }

  return note
}

const requireSubject = ( id: string ): SubjectRecord => {
  const subject = findSubject( id )

  if( subject === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  return subject
}

const toMeleteQuestion = ( question: QuestionRecord ): MeleteQuestion => ( {
  id: question.id,
  note_id: question.note_id,
  position: question.position,
  prompt: question.prompt,
  answer: question.answer,
  passage: question.passage,
  state: question.state,
  fsrs_state: question.fsrs_state,
  due: question.due,
  reps: question.reps,
  lapses: question.lapses,
  last_review: question.last_review,
} )

const toMeleteNote = ( note: NoteRecord, questions: QuestionRecord[] ): MeleteNote => {
  const active = questions.filter( ( { state } ) => state === 'active' )

  return {
    id: note.id,
    subject_id: note.subject_id,
    path: note.path,
    title: note.title,
    enrolled: note.enrolled,
    generation: note.generation,
    generation_error: note.generation_error,
    question_count: active.length,
    stale: active.some( ( { body_hash } ) => body_hash !== note.body_hash ),
    missing: note.missing_at !== null,
  }
}

const noteView = ( note: NoteRecord ): GetMeleteNoteResponse => {
  const questions = listForNote( note.id )

  return { note: toMeleteNote( note, questions ), questions: questions.map( toMeleteQuestion ) }
}

// Until the review queue exists (task 5.3), the day's allowance is only capped by what is new
const toMeleteSubject = ( subject: SubjectRecord, now: Date ): MeleteSubject => {
  const notes = listNotesBySubject( subject.id ).filter( ( { missing_at } ) => missing_at === null )
  const counts = countBySubject( now.toISOString() ).find( ( { subject_id } ) => {
    return subject_id === subject.id
  } )
  const newAvailable = counts?.new_available ?? 0

  return {
    id: subject.id,
    name: subject.folder.split( '/' ).at( -1 ) ?? subject.folder,
    folder: subject.folder,
    auto_enroll: subject.auto_enroll,
    new_per_day: subject.new_per_day,
    note_count: notes.length,
    enrolled_count: notes.filter( ( { enrolled } ) => enrolled ).length,
    due_count: counts?.due ?? 0,
    new_available: newAvailable,
    new_remaining_today: Math.min( subject.new_per_day, newAvailable ),
  }
}

const subjectView = ( subject: SubjectRecord, now: Date ): GetMeleteSubjectResponse => ( {
  subject: toMeleteSubject( subject, now ),
  notes: listNotesBySubject( subject.id ).map( ( note ) => {
    return toMeleteNote( note, listForNote( note.id ) )
  } ),
} )

// A subject belongs to the learning root only while it is a direct child folder of it
const requireSubjectInRoot = ( id: string, learningRoot: string ): SubjectRecord => {
  const subject = requireSubject( id )

  if( subject.folder.split( '/' ).slice( 0, -1 ).join( '/' ) !== learningRoot ) {
    throw new NotFoundError( 'Subject not found' )
  }

  return subject
}

const queueGeneration = ( noteId: string ): void => {
  updateNote( noteId, { generation: 'queued', generation_error: null } )
}

// Questions made from an older body are retired, and a note with none left to review is queued
const enrol = ( note: NoteRecord, at: string ): void => {
  if( note.enrolled ) {
    return
  }

  setEnrolled( [ note.id ], true, at )

  const current = listForNote( note.id ).some( ( { state, body_hash } ) => {
    return state === 'active' && body_hash === note.body_hash
  } )

  if( !current && ( note.generation === 'idle' || note.generation === 'failed' ) ) {
    retireActiveForNote( note.id )
    queueGeneration( note.id )
  }
}

// Questions and cards are kept; a note still waiting in the queue is taken out of it
const unenrol = ( note: NoteRecord, at: string ): void => {
  setEnrolled( [ note.id ], false, at )

  if( note.generation === 'queued' ) {
    updateNote( note.id, { generation: 'idle' } )
  }
}

export const setNoteEnrolled = (
  id: string,
  enrolled: boolean,
  now = new Date(),
): GetMeleteNoteResponse => {
  const note = requireNote( id )

  if( note.missing_at !== null ) {
    throw new ConflictError( 'The note is missing from the vault' )
  }

  getDatabase().transaction( () => {
    if( enrolled ) {
      enrol( note, now.toISOString() )
    } else {
      unenrol( note, now.toISOString() )
    }
  } )()

  return noteView( requireNote( id ) )
}

export const setSubjectEnrolled = async (
  id: string,
  enrolled: boolean,
  now = new Date(),
): Promise< GetMeleteSubjectResponse > => {
  requireSubject( id )
  await scanLearningRoot( { force: true, now } )

  getDatabase().transaction( () => {
    const live = listNotesBySubject( id ).filter( ( { missing_at } ) => missing_at === null )

    for( const note of live ) {
      if( enrolled ) {
        enrol( note, now.toISOString() )
      } else {
        unenrol( note, now.toISOString() )
      }
    }
  } )()

  return subjectView( requireSubject( id ), now )
}

export const regenerateNote = ( id: string ): GetMeleteNoteResponse => {
  const note = requireNote( id )

  if( note.missing_at !== null ) {
    throw new ConflictError( 'The note is missing from the vault' )
  }

  if( !note.enrolled ) {
    throw new ConflictError( 'Enrol the note before regenerating its questions' )
  }

  if( note.generation === 'queued' || note.generation === 'generating' ) {
    throw new ConflictError( 'Questions are already being generated for this note' )
  }

  getDatabase().transaction( () => {
    retireActiveForNote( id )
    queueGeneration( id )
  } )()

  return noteView( requireNote( id ) )
}

export const retryGeneration = ( id: string ): GetMeleteNoteResponse => {
  if( requireNote( id ).generation !== 'failed' ) {
    throw new ConflictError( 'Only a note whose generation failed can be retried' )
  }

  queueGeneration( id )

  return noteView( requireNote( id ) )
}

export const dropQuestion = ( id: string ): MeleteQuestion => {
  const question = findQuestion( id )

  if( question === undefined ) {
    throw new NotFoundError( 'Question not found' )
  }

  if( question.state !== 'active' ) {
    throw new ConflictError( 'Only an active question can be dropped' )
  }

  setState( [ id ], 'dropped' )

  return toMeleteQuestion( { ...question, state: 'dropped' } )
}

export const updateSubject = (
  id: string,
  changes: UpdateMeleteSubjectBody,
  now = new Date(),
): MeleteSubject => {
  requireSubject( id )

  const updated = updateStoredSubject( id, changes )

  if( updated === undefined ) {
    throw new NotFoundError( 'Subject not found' )
  }

  return toMeleteSubject( updated, now )
}

export const getToday = async ( now = new Date() ): Promise< GetMeleteTodayResponse > => {
  const learningRoot = getLearningRoot()

  if( learningRoot === null ) {
    return {
      learning_root: null,
      subjects: [],
      totals: { due: 0, new_remaining: 0, learning_soon: 0 },
    }
  }

  await scanLearningRoot( { now } )

  const folders = new Set( await listSubjectFolders( config.vaultPath, learningRoot ) )
  const subjects = listSubjects()
    .filter( ( { folder } ) => folders.has( folder ) )
    .map( ( subject ) => toMeleteSubject( subject, now ) )
    .sort( ( a, b ) => a.name.localeCompare( b.name, undefined, { sensitivity: 'base' } ) )

  return {
    learning_root: learningRoot,
    subjects,
    totals: {
      due: subjects.reduce( ( sum, { due_count } ) => sum + due_count, 0 ),
      new_remaining: subjects.reduce( ( sum, { new_remaining_today } ) => {
        return sum + new_remaining_today
      }, 0 ),
      learning_soon: 0,
    },
  }
}

export const getSubject = async (
  id: string,
  now = new Date(),
): Promise< GetMeleteSubjectResponse > => {
  await scanLearningRoot( { now } )

  const learningRoot = getLearningRoot()

  if( learningRoot === null ) {
    throw new ConflictError( 'Choose a learning root first' )
  }

  return subjectView( requireSubjectInRoot( id, learningRoot ), now )
}

export const getNote = ( id: string ): GetMeleteNoteResponse => noteView( requireNote( id ) )
