// Packages
import { describe, it, expect } from 'vitest'
// Test support
import { addNote, addQuestion, addSubject } from '../test-support/meleteData.fixture.js'
// Repositories
import {
  countBySubject,
  findQuestion,
  insertQuestions,
  listDue,
  listForNote,
  listLearningSoon,
  listNew,
  retireActiveForNote,
  saveCard,
  setState,
} from './meleteQuestions.repository.js'
import type { CardRow } from './meleteQuestions.repository.js'

const now = '2026-10-22T10:00:00.000Z'
const past = '2026-10-22T09:00:00.000Z'
const future = '2026-10-23T10:00:00.000Z'
const yesterday = '2026-10-21T00:00:00.000Z'
const until = '2026-10-22T10:20:00.000Z'

const generated = ( count: number ): { prompt: string, answer: string, passage: string }[] => {
  return Array.from( { length: count }, ( _, index ) => ( {
    prompt: `Prompt ${ index + 1 }`,
    answer: `Answer ${ index + 1 }`,
    passage: index === 0 ? 'A passage' : '',
  } ) )
}

describe( 'insertQuestions', () => {
  it( 'stores questions in order as new, active cards with the hash and run', () => {
    const noteId = addNote( addSubject() )
    const questions = insertQuestions( noteId, 7, 'hash-1', generated( 3 ) )

    expect( questions.map( ( { position, prompt } ) => [ position, prompt ] ) )
      .toEqual( [ [ 1, 'Prompt 1' ], [ 2, 'Prompt 2' ], [ 3, 'Prompt 3' ] ] )
    expect( questions[ 0 ] ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      note_id: noteId,
      position: 1,
      prompt: 'Prompt 1',
      answer: 'Answer 1',
      passage: 'A passage',
      body_hash: 'hash-1',
      state: 'active',
      run_id: 7,
      due: null,
      stability: 0,
      difficulty: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      fsrs_state: 'new',
      last_review: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
  } )

  it( 'inserts nothing for an empty list', () => {
    expect( insertQuestions( addNote( addSubject() ), 1, 'h', [] ) ).toEqual( [] )
  } )

  it( 'inserts all or none', () => {
    const noteId = addNote( addSubject() )
    const broken = [ ...generated( 2 ), { prompt: null, answer: 'x', passage: '' } ]

    expect( () => insertQuestions( noteId, 1, 'h', broken as never ) ).toThrow()
    expect( listForNote( noteId ) ).toEqual( [] )
  } )
} )

describe( 'findQuestion and listForNote', () => {
  it( 'finds a question and returns undefined for an unknown one', () => {
    const [ question ] = insertQuestions( addNote( addSubject() ), 1, 'h', generated( 1 ) )

    expect( findQuestion( question?.id ?? '' ) ).toEqual( question )
    expect( findQuestion( crypto.randomUUID() ) ).toBeUndefined()
  } )

  it( 'lists active and dropped questions by position, never retired ones', () => {
    const noteId = addNote( addSubject() )

    addQuestion( noteId, { position: 3 } )
    addQuestion( noteId, { position: 1, state: 'dropped' } )
    addQuestion( noteId, { position: 2, state: 'retired' } )
    addQuestion( noteId, { position: 2 } )

    expect( listForNote( noteId ).map( ( { position, state } ) => [ position, state ] ) )
      .toEqual( [ [ 1, 'dropped' ], [ 2, 'active' ], [ 3, 'active' ] ] )
  } )
} )

describe( 'setState and retireActiveForNote', () => {
  it( 'sets the state of the given questions only', () => {
    const noteId = addNote( addSubject() )
    const a = addQuestion( noteId )
    const b = addQuestion( noteId, { position: 2 } )

    setState( [ a ], 'dropped' )

    expect( findQuestion( a )?.state ).toBe( 'dropped' )
    expect( findQuestion( b )?.state ).toBe( 'active' )
    expect( () => setState( [], 'dropped' ) ).not.toThrow()
  } )

  it( 'retires active questions of one note and leaves dropped ones and other notes alone', () => {
    const subjectId = addSubject()
    const noteId = addNote( subjectId )
    const otherNote = addNote( subjectId )
    const active = addQuestion( noteId )
    const dropped = addQuestion( noteId, { position: 2, state: 'dropped' } )
    const elsewhere = addQuestion( otherNote )

    expect( retireActiveForNote( noteId ) ).toBe( 1 )
    expect( findQuestion( active )?.state ).toBe( 'retired' )
    expect( findQuestion( dropped )?.state ).toBe( 'dropped' )
    expect( findQuestion( elsewhere )?.state ).toBe( 'active' )
  } )
} )

describe( 'saveCard', () => {
  it( 'round-trips every card column', () => {
    const id = addQuestion( addNote( addSubject() ) )
    const card: CardRow = {
      due: future,
      stability: 3.25,
      difficulty: 5.5,
      scheduled_days: 3,
      learning_steps: 1,
      reps: 4,
      lapses: 1,
      fsrs_state: 'relearning',
      last_review: now,
    }

    saveCard( id, card )

    expect( findQuestion( id ) ).toMatchObject( card )
  } )
} )

describe( 'the review queries', () => {
  const setup = () => {
    const subjectId = addSubject( 'Learning/TS' )
    const otherSubject = addSubject( 'Learning/Rust' )

    return { subjectId, otherSubject, noteId: addNote( subjectId, { path: 'Learning/TS/a.md' } ) }
  }

  describe( 'listDue', () => {
    it( 'returns due questions, learning before review, then by due time', () => {
      const { subjectId, noteId } = setup()
      const review = addQuestion( noteId, { position: 1, fsrsState: 'review', due: yesterday } )
      const learning = addQuestion( noteId, { position: 2, fsrsState: 'learning', due: past } )
      const relearning = addQuestion( noteId, {
        position: 3,
        fsrsState: 'relearning',
        due: '2026-10-22T09:30:00.000Z',
      } )
      const reviewLater = addQuestion( noteId, {
        position: 4,
        fsrsState: 'review',
        due: '2026-10-22T08:00:00.000Z',
      } )

      addQuestion( noteId, { position: 5, fsrsState: 'review', due: future } )

      expect( listDue( { subjectIds: [ subjectId ], now } ).map( ( { id } ) => id ) )
        .toEqual( [ learning, relearning, review, reviewLater ] )
    } )

    it( 'includes a question due exactly now', () => {
      const { subjectId, noteId } = setup()
      const id = addQuestion( noteId, { fsrsState: 'review', due: now } )

      expect( listDue( { subjectIds: [ subjectId ], now } ).map( ( found ) => found.id ) )
        .toEqual( [ id ] )
    } )

    it( 'carries the subject id and stays within the subjects asked for', () => {
      const { subjectId, otherSubject, noteId } = setup()
      const otherNote = addNote( otherSubject, { path: 'Learning/Rust/a.md' } )

      addQuestion( noteId, { fsrsState: 'review', due: past } )
      addQuestion( otherNote, { fsrsState: 'review', due: past } )

      const only = listDue( { subjectIds: [ subjectId ], now } )
      const both = listDue( { subjectIds: [ subjectId, otherSubject ], now } )

      expect( only.map( ( { subject_id } ) => subject_id ) ).toEqual( [ subjectId ] )
      expect( both ).toHaveLength( 2 )
      expect( listDue( { subjectIds: [], now } ) ).toEqual( [] )
    } )

    it( 'includes a new question that was served but not rated yet', () => {
      const { subjectId, noteId } = setup()
      const served = addQuestion( noteId, { fsrsState: 'new', due: past } )

      expect( listDue( { subjectIds: [ subjectId ], now } ).map( ( { id } ) => id ) )
        .toEqual( [ served ] )
    } )

    it( 'leaves out new, dropped, retired, unenrolled and missing', () => {
      const { subjectId, noteId } = setup()
      const unenrolled = addNote( subjectId, { path: 'Learning/TS/b.md', enrolled: false } )
      const missing = addNote( subjectId, { path: 'Learning/TS/c.md', missingAt: past } )

      addQuestion( noteId, { position: 1, fsrsState: 'new', due: null } )
      addQuestion( noteId, { position: 2, fsrsState: 'review', due: past, state: 'dropped' } )
      addQuestion( noteId, { position: 3, fsrsState: 'review', due: past, state: 'retired' } )
      addQuestion( unenrolled, { fsrsState: 'review', due: past } )
      addQuestion( missing, { fsrsState: 'review', due: past } )

      expect( listDue( { subjectIds: [ subjectId ], now } ) ).toEqual( [] )
    } )
  } )

  describe( 'listNew', () => {
    it( 'returns new unscheduled questions by note enrollment time, path, then position', () => {
      const { subjectId } = setup()
      const enroll = ( path: string, enrolledAt: string ): string => {
        return addNote( subjectId, { path, enrolledAt } )
      }
      const second = enroll( 'Learning/TS/b.md', '2026-10-01T00:00:00.000Z' )
      const first = enroll( 'Learning/TS/z.md', '2026-09-30T00:00:00.000Z' )
      const third = enroll( 'Learning/TS/c.md', '2026-10-01T00:00:00.000Z' )
      const q1 = addQuestion( first, { position: 2 } )
      const q0 = addQuestion( first, { position: 1 } )
      const q2 = addQuestion( second )
      const q3 = addQuestion( third )

      expect( listNew( { subjectId, limit: 10 } ).map( ( { id } ) => id ) )
        .toEqual( [ q0, q1, q2, q3 ] )
    } )

    it( 'honours the limit, including zero', () => {
      const { subjectId, noteId } = setup()

      addQuestion( noteId, { position: 1 } )
      addQuestion( noteId, { position: 2 } )
      addQuestion( noteId, { position: 3 } )

      expect( listNew( { subjectId, limit: 2 } ) ).toHaveLength( 2 )
      expect( listNew( { subjectId, limit: 0 } ) ).toEqual( [] )
    } )

    it( 'leaves out scheduled, dropped, retired, unenrolled, missing and other subjects', () => {
      const { subjectId, otherSubject, noteId } = setup()
      const unenrolled = addNote( subjectId, { path: 'Learning/TS/b.md', enrolled: false } )
      const missing = addNote( subjectId, { path: 'Learning/TS/c.md', missingAt: past } )
      const elsewhere = addNote( otherSubject, { path: 'Learning/Rust/a.md' } )

      addQuestion( noteId, { position: 1, fsrsState: 'learning', due: past } )
      addQuestion( noteId, { position: 2, state: 'dropped' } )
      addQuestion( noteId, { position: 3, state: 'retired' } )
      addQuestion( unenrolled )
      addQuestion( missing )
      addQuestion( elsewhere )

      expect( listNew( { subjectId, limit: 10 } ) ).toEqual( [] )
    } )
  } )

  describe( 'listLearningSoon', () => {
    it( 'returns learning and relearning questions due up to the cut-off, soonest first', () => {
      const { subjectId, noteId } = setup()
      const soon = addQuestion( noteId, {
        position: 1,
        fsrsState: 'learning',
        due: '2026-10-22T10:05:00.000Z',
      } )
      const sooner = addQuestion( noteId, {
        position: 2,
        fsrsState: 'relearning',
        due: '2026-10-22T10:02:00.000Z',
      } )

      addQuestion( noteId, { position: 3, fsrsState: 'learning', due: '2026-10-22T10:30:00.000Z' } )
      addQuestion( noteId, { position: 4, fsrsState: 'review', due: '2026-10-22T10:03:00.000Z' } )

      expect( listLearningSoon( { subjectIds: [ subjectId ], until } ).map( ( { id } ) => id ) )
        .toEqual( [ sooner, soon ] )
      expect( listLearningSoon( { subjectIds: [], until } ) ).toEqual( [] )
    } )

    it( 'leaves out dropped, unenrolled and missing', () => {
      const { subjectId, noteId } = setup()
      const unenrolled = addNote( subjectId, { path: 'Learning/TS/b.md', enrolled: false } )
      const missing = addNote( subjectId, { path: 'Learning/TS/c.md', missingAt: past } )
      const due = '2026-10-22T10:02:00.000Z'

      addQuestion( noteId, { fsrsState: 'learning', due, state: 'dropped' } )
      addQuestion( unenrolled, { fsrsState: 'learning', due } )
      addQuestion( missing, { fsrsState: 'learning', due } )

      expect( listLearningSoon( { subjectIds: [ subjectId ], until } ) ).toEqual( [] )
    } )
  } )

  describe( 'countBySubject', () => {
    it( 'counts due and new questions per subject', () => {
      const { subjectId, otherSubject, noteId } = setup()
      const otherNote = addNote( otherSubject, { path: 'Learning/Rust/a.md' } )

      addQuestion( noteId, { position: 1, fsrsState: 'review', due: past } )
      addQuestion( noteId, { position: 2, fsrsState: 'learning', due: past } )
      addQuestion( noteId, { position: 3, fsrsState: 'review', due: future } )
      addQuestion( noteId, { position: 4 } )
      addQuestion( otherNote, { position: 1 } )
      addQuestion( otherNote, { position: 2 } )

      expect( countBySubject( now ) ).toEqual( expect.arrayContaining( [
        { subject_id: subjectId, due: 2, new_available: 1 },
        { subject_id: otherSubject, due: 0, new_available: 2 },
      ] ) )
    } )

    it( 'gives a subject with no questions zeros and ignores excluded questions', () => {
      const { subjectId, noteId } = setup()
      const unenrolled = addNote( subjectId, { path: 'Learning/TS/b.md', enrolled: false } )

      addQuestion( noteId, { state: 'dropped', fsrsState: 'review', due: past } )
      addQuestion( unenrolled, { fsrsState: 'review', due: past } )

      expect( countBySubject( now ).find( ( counts ) => counts.subject_id === subjectId ) )
        .toEqual( { subject_id: subjectId, due: 0, new_available: 0 } )
    } )
  } )
} )
