// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
} from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Repositories
import {
  findNote,
  listNotesUnder,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import { findQuestion } from '../repositories/meleteQuestions.repository.js'
import { insertReview } from '../repositories/meleteReviews.repository.js'
import { listSubjects } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import {
  dropQuestion,
  getNote,
  getSubject,
  getToday,
  regenerateNote,
  retryGeneration,
  setNoteEnrolled,
  setSubjectEnrolled,
  updateSubject,
} from './melete.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

const configMock = vi.hoisted( () => ( {
  logLevel: 'silent',
  vaultPath: '',
  timeZone: 'Asia/Singapore',
  obsidianVaultName: undefined as string | undefined,
  melete: { requestRetention: 0.9, dayStartHour: 4 },
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )

const T0 = new Date( '2026-10-22T10:00:00.000Z' )
const at = ( seconds: number ): Date => new Date( T0.getTime() + seconds * 1000 )

let vault: MeleteVault

const noteId = ( path: string ): string => {
  const found = listNotesUnder( 'Learning' ).find( ( note ) => {
    return note.path === `Learning/${ path }` && note.missing_at === null
  } )

  if( found === undefined ) {
    throw new Error( `No note ${ path }` )
  }

  return found.id
}

const subjectId = ( name: string ): string => {
  const found = listSubjects().find( ( { folder } ) => folder === `Learning/${ name }` )

  if( found === undefined ) {
    throw new Error( `No subject ${ name }` )
  }

  return found.id
}

const GENERICS = 'TypeScript/Generics.md'
const CONDITIONAL = 'TypeScript/Advanced/Conditional Types.md'
const OWNERSHIP = 'Rust/Ownership.md'

const hashOf = ( id: string ): string => findNote( id )?.body_hash ?? ''

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultPath = vault.vaultPath
  setSetting( 'melete_learning_root', 'Learning' )
  resetScanClock()
  await scanLearningRoot( { force: true, now: at( 0 ) } )
} )

afterEach( async () => {
  await vault.cleanup()
} )

describe( 'setNoteEnrolled', () => {
  it( 'enrols a note with no questions and queues generation', () => {
    const id = noteId( GENERICS )

    const result = setNoteEnrolled( id, true, at( 5 ) )

    expect( findNote( id ) ).toMatchObject( {
      enrolled: true,
      enrolled_at: at( 5 ).toISOString(),
      generation: 'queued',
      generation_error: null,
    } )
    expect( GetMeleteNoteResponse.parse( result ).note ).toMatchObject( {
      enrolled: true,
      generation: 'queued',
    } )
  } )

  it( 'does not queue generation when the active questions match the current body', () => {
    const id = noteId( GENERICS )
    const questionId = addQuestion( id, { hash: hashOf( id ) } )

    setNoteEnrolled( id, true, at( 5 ) )

    expect( findNote( id )?.generation ).toBe( 'idle' )
    expect( findQuestion( questionId )?.state ).toBe( 'active' )
  } )

  it( 'retires questions made from an older body and queues generation', () => {
    const id = noteId( GENERICS )
    const old = addQuestion( id, { hash: 'older' } )
    const dropped = addQuestion( id, { hash: 'older', state: 'dropped', position: 2 } )

    setNoteEnrolled( id, true, at( 5 ) )

    expect( findNote( id )?.generation ).toBe( 'queued' )
    expect( findQuestion( old )?.state ).toBe( 'retired' )
    expect( findQuestion( dropped )?.state ).toBe( 'dropped' )
  } )

  it( 'leaves a note that is already generating alone', () => {
    const id = noteId( GENERICS )
    updateNote( id, { generation: 'generating' } )

    setNoteEnrolled( id, true, at( 5 ) )

    expect( findNote( id )?.generation ).toBe( 'generating' )
  } )

  it( 'does nothing when the note is already enrolled', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( id, true, at( 5 ) )

    setNoteEnrolled( id, true, at( 60 ) )

    expect( findNote( id )?.enrolled_at ).toBe( at( 5 ).toISOString() )
  } )

  it( 'keeps questions and the enrolment time when unenrolling', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( id, true, at( 5 ) )
    updateNote( id, { generation: 'idle' } )
    const questionId = addQuestion( id, { hash: hashOf( id ) } )

    const { note } = setNoteEnrolled( id, false, at( 10 ) )

    expect( note.enrolled ).toBe( false )
    expect( findNote( id )?.enrolled_at ).toBe( at( 5 ).toISOString() )
    expect( findQuestion( questionId )?.state ).toBe( 'active' )
  } )

  it( 'takes a queued note out of the queue when unenrolling', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( id, true, at( 5 ) )

    setNoteEnrolled( id, false, at( 10 ) )

    expect( findNote( id )?.generation ).toBe( 'idle' )
  } )

  it( 'refuses an unknown note and a note missing from the vault', async () => {
    expect( () => setNoteEnrolled( crypto.randomUUID(), true, at( 5 ) ) ).toThrow( NotFoundError )

    const id = noteId( OWNERSHIP )
    await vault.remove( 'Learning/Rust/Ownership.md' )
    await scanLearningRoot( { force: true, now: at( 1 ) } )

    expect( () => setNoteEnrolled( id, true, at( 5 ) ) ).toThrow( ConflictError )
  } )
} )

describe( 'setSubjectEnrolled', () => {
  it( 'enrols every live note of the subject and no others', async () => {
    const result = await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( 5 ) )

    expect( GetMeleteSubjectResponse.parse( result ).notes.map( ( { enrolled } ) => enrolled ) )
      .toEqual( [ true, true ] )
    expect( findNote( noteId( CONDITIONAL ) ) )
      .toMatchObject( { enrolled: true, generation: 'queued' } )
    expect( findNote( noteId( OWNERSHIP ) )?.enrolled ).toBe( false )
    expect( result.subject.enrolled_count ).toBe( 2 )
  } )

  it( 'scans first, so a note added a moment ago is included', async () => {
    await vault.write( 'Learning/TypeScript/Fresh.md', '# Fresh\n' )

    await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( 5 ) )

    expect( findNote( noteId( 'TypeScript/Fresh.md' ) )?.enrolled ).toBe( true )
  } )

  it( 'skips notes that are missing from the vault', async () => {
    const id = noteId( GENERICS )
    await vault.remove( 'Learning/TypeScript/Generics.md' )

    await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( 5 ) )

    expect( findNote( id ) ).toMatchObject( { enrolled: false, generation: 'idle' } )
  } )

  it( 'unenrols every note', async () => {
    await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( 5 ) )

    const result = await setSubjectEnrolled( subjectId( 'TypeScript' ), false, at( 10 ) )

    expect( result.notes.every( ( { enrolled } ) => !enrolled ) ).toBe( true )
  } )

  it( 'refuses an unknown subject', async () => {
    await expect( setSubjectEnrolled( crypto.randomUUID(), true, at( 5 ) ) )
      .rejects.toThrow( NotFoundError )
  } )
} )

describe( 'regenerateNote', () => {
  it( 'retires the active questions and queues generation', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( id, true, at( 5 ) )
    updateNote( id, { generation: 'idle' } )
    const questionId = addQuestion( id, { hash: hashOf( id ) } )

    const result = regenerateNote( id )

    expect( findQuestion( questionId )?.state ).toBe( 'retired' )
    expect( result.note.generation ).toBe( 'queued' )
    expect( result.questions ).toEqual( [] )
  } )

  it.each( [ 'queued', 'generating' ] as const )( 'refuses a note that is %s', ( state ) => {
    const id = noteId( GENERICS )
    setNoteEnrolled( id, true, at( 5 ) )
    updateNote( id, { generation: state } )

    expect( () => regenerateNote( id ) ).toThrow( ConflictError )
  } )

  it( 'refuses a note that is not enrolled and an unknown note', () => {
    expect( () => regenerateNote( noteId( GENERICS ) ) ).toThrow( ConflictError )
    expect( () => regenerateNote( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'retryGeneration', () => {
  it( 'queues a failed note and clears the error', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( id, true, at( 5 ) )
    updateNote( id, { generation: 'failed', generation_error: 'Note is too long' } )

    const result = retryGeneration( id )

    expect( result.note ).toMatchObject( { generation: 'queued', generation_error: null } )
  } )

  it( 'refuses a note that has not failed', () => {
    expect( () => retryGeneration( noteId( GENERICS ) ) ).toThrow( ConflictError )
    expect( () => retryGeneration( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'dropQuestion', () => {
  it( 'drops an active question', () => {
    const questionId = addQuestion( noteId( GENERICS ) )

    const question = dropQuestion( questionId )

    expect( question ).toMatchObject( { id: questionId, state: 'dropped' } )
    expect( findQuestion( questionId )?.state ).toBe( 'dropped' )
  } )

  it.each( [ 'dropped', 'retired' ] )( 'refuses a question that is %s', ( state ) => {
    const questionId = addQuestion( noteId( GENERICS ), { state } )

    expect( () => dropQuestion( questionId ) ).toThrow( ConflictError )
  } )

  it( 'refuses an unknown question', () => {
    expect( () => dropQuestion( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'updateSubject', () => {
  it( 'changes auto-enrol and new questions per day', () => {
    const id = subjectId( 'TypeScript' )

    const subject = updateSubject( id, { auto_enroll: true, new_per_day: 3 } )

    expect( subject ).toMatchObject( { id, auto_enroll: true, new_per_day: 3 } )
    expect( updateSubject( id, { new_per_day: 0 } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 0 } )
  } )

  it( 'refuses an unknown subject', () => {
    expect( () => updateSubject( crypto.randomUUID(), { auto_enroll: true } ) )
      .toThrow( NotFoundError )
  } )
} )

describe( 'getToday', () => {
  it( 'says so when there is no learning root', async () => {
    setSetting( 'melete_learning_root', null )

    expect( await getToday( at( 1 ) ) ).toEqual( {
      learning_root: null,
      subjects: [],
      totals: { due: 0, new_remaining: 0, learning_soon: 0 },
    } )
  } )

  it( 'lists the subjects by name with their counts', async () => {
    const generics = noteId( GENERICS )
    const ownership = noteId( OWNERSHIP )
    await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( 1 ) )
    setNoteEnrolled( ownership, true, at( 1 ) )
    addQuestion( generics, { fsrsState: 'review', due: at( -60 ).toISOString() } )
    addQuestion( generics, { position: 2 } )
    addQuestion( generics, { position: 3 } )
    addQuestion( ownership, { fsrsState: 'review', due: at( 3600 ).toISOString() } )
    updateSubject( subjectId( 'TypeScript' ), { new_per_day: 1 } )

    const today = GetMeleteTodayResponse.parse( await getToday( at( 2 ) ) )

    expect( today.learning_root ).toBe( 'Learning' )
    expect( today.subjects.map( ( { name } ) => name ) ).toEqual( [ 'Rust', 'TypeScript' ] )
    expect( today.subjects[ 1 ] ).toMatchObject( {
      folder: 'Learning/TypeScript',
      note_count: 2,
      enrolled_count: 2,
      due_count: 1,
      new_available: 2,
      new_remaining_today: 1,
    } )
    expect( today.subjects[ 0 ] ).toMatchObject( {
      note_count: 1,
      enrolled_count: 1,
      due_count: 0,
      new_available: 0,
    } )
    expect( today.totals ).toEqual( { due: 1, new_remaining: 1, learning_soon: 0 } )
  } )

  it( 'takes the day\'s new questions already reviewed off what is remaining', async () => {
    const generics = noteId( GENERICS )
    await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( 1 ) )
    const reviewed = addQuestion( generics, {
      fsrsState: 'review',
      due: at( 86_400 ).toISOString(),
    } )
    addQuestion( generics, { position: 2 } )
    addQuestion( generics, { position: 3 } )
    insertReview( {
      question_id: reviewed,
      reviewed_at: at( 1 ).toISOString(),
      mode: 'quick',
      rating: 'good',
      suggested_rating: null,
      answer: null,
      grade_run_id: null,
      was_new: true,
      before_state: '{}',
    } )
    updateSubject( subjectId( 'TypeScript' ), { new_per_day: 2 } )

    const { subjects, totals } = await getToday( at( 2 ) )

    expect( subjects[ 1 ] ).toMatchObject( { new_available: 2, new_remaining_today: 1 } )
    expect( totals.new_remaining ).toBe( 1 )
  } )

  it( 'counts learning questions coming up within 20 minutes', async () => {
    const generics = noteId( GENERICS )
    await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( 1 ) )
    addQuestion( generics, { fsrsState: 'learning', due: at( 10 * 60 ).toISOString() } )
    addQuestion( generics, {
      position: 2,
      fsrsState: 'learning',
      due: at( 40 * 60 ).toISOString(),
    } )

    const { totals } = await getToday( at( 2 ) )

    expect( totals ).toEqual( { due: 0, new_remaining: 0, learning_soon: 1 } )
  } )

  it( 'drops a subject whose folder is gone', async () => {
    await vault.move( 'Learning/Rust', 'Learning/Rustlang' )

    const { subjects } = await getToday( at( 31 ) )

    expect( subjects.map( ( { name } ) => name ) ).toEqual( [ 'Rustlang', 'TypeScript' ] )
  } )

  it( 'counts only the notes still in the vault', async () => {
    await vault.remove( 'Learning/Rust/Ownership.md' )

    const { subjects } = await getToday( at( 31 ) )

    expect( subjects.find( ( { name } ) => name === 'Rust' )?.note_count ).toBe( 0 )
  } )
} )

describe( 'getSubject', () => {
  it( 'returns the subject and its notes by path', async () => {
    const id = noteId( GENERICS )
    addQuestion( id, { hash: hashOf( id ) } )
    addQuestion( id, { hash: hashOf( id ), state: 'dropped', position: 2 } )

    const result = GetMeleteSubjectResponse.parse( await getSubject( subjectId( 'TypeScript' ) ) )

    expect( result.subject.name ).toBe( 'TypeScript' )
    expect( result.notes.map( ( { path } ) => path ) ).toEqual( [
      'Learning/TypeScript/Advanced/Conditional Types.md',
      'Learning/TypeScript/Generics.md',
    ] )
    expect( result.notes[ 1 ] ).toMatchObject( {
      title: 'Generics in TypeScript',
      enrolled: false,
      generation: 'idle',
      generation_error: null,
      question_count: 1,
      stale: false,
      missing: false,
    } )
  } )

  it( 'marks a note stale when its questions were made from an older body', async () => {
    const id = noteId( GENERICS )
    addQuestion( id, { hash: 'older' } )

    const { notes } = await getSubject( subjectId( 'TypeScript' ) )

    expect( notes.find( ( note ) => note.id === id )?.stale ).toBe( true )
  } )

  it( 'marks a note missing and keeps listing it', async () => {
    const id = noteId( GENERICS )
    await vault.remove( 'Learning/TypeScript/Generics.md' )

    const { notes } = await getSubject( subjectId( 'TypeScript' ), at( 31 ) )

    expect( notes.find( ( note ) => note.id === id )?.missing ).toBe( true )
  } )

  it( 'refuses an unknown subject, and a missing learning root', async () => {
    await expect( getSubject( crypto.randomUUID() ) ).rejects.toThrow( NotFoundError )

    setSetting( 'melete_learning_root', null )

    await expect( getSubject( subjectId( 'TypeScript' ) ) )
      .rejects.toThrow( new ConflictError( 'Choose a learning root first' ) )
  } )

  it( 'refuses a subject outside the learning root', async () => {
    setSetting( 'melete_learning_root', 'Inbox' )

    await expect( getSubject( subjectId( 'TypeScript' ), at( 31 ) ) )
      .rejects.toThrow( NotFoundError )
  } )
} )

describe( 'getNote, Obsidian link', () => {
  it( 'is null without a vault name and the note\'s link with one', () => {
    const id = noteId( GENERICS )

    expect( getNote( id ).obsidian_url ).toBeNull()

    configMock.obsidianVaultName = 'My Brain'
    try {
      expect( getNote( id ).obsidian_url ).toBe(
        'obsidian://open?vault=My%20Brain&file=Learning%2FTypeScript%2FGenerics',
      )
    } finally {
      configMock.obsidianVaultName = undefined
    }
  } )
} )

describe( 'getNote', () => {
  it( 'returns active and dropped questions by position, never retired ones', () => {
    const id = noteId( GENERICS )
    const second = addQuestion( id, { position: 2 } )
    const first = addQuestion( id, { position: 1, state: 'dropped' } )
    addQuestion( id, { position: 3, state: 'retired' } )

    const result = GetMeleteNoteResponse.parse( getNote( id ) )

    expect( result.questions.map( ( question ) => question.id ) ).toEqual( [ first, second ] )
    expect( result.questions[ 0 ] ).toMatchObject( {
      state: 'dropped',
      fsrs_state: 'new',
      due: null,
      reps: 0,
      lapses: 0,
      last_review: null,
    } )
    expect( result.note.question_count ).toBe( 1 )
  } )

  it( 'refuses an unknown note', () => {
    expect( () => getNote( crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )
