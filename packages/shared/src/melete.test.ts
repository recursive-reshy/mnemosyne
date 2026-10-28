// Packages
import { describe, it, expect } from 'vitest'
import type { z } from 'zod'
// Melete
import {
  EnrollSubjectBody,
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  GetNextReviewResponse,
  GradeAnswerBody,
  GradeAnswerResponse,
  MeleteFsrsState,
  MeleteGeneration,
  MeleteGrade,
  MeleteGradeOutput,
  MeleteNote,
  MeleteQuestion,
  MeleteQuestionState,
  MeleteQuestionsOutput,
  MeleteRating,
  MeleteReviewCounts,
  MeleteReviewItem,
  MeleteReviewMode,
  MeleteSubject,
  RecordReviewBody,
  RecordReviewResponse,
  UpdateMeleteNoteBody,
  UpdateMeleteSubjectBody,
} from './melete.js'

const accepts = ( schema: z.ZodType, value: unknown ): boolean => {
  return schema.safeParse( value ).success
}

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const otherId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5c'

const subject = {
  id,
  name: 'TypeScript',
  folder: 'Learning/TypeScript',
  auto_enroll: false,
  new_per_day: 10,
  note_count: 4,
  enrolled_count: 2,
  due_count: 3,
  new_available: 5,
  new_remaining_today: 5,
}

const note = {
  id,
  subject_id: otherId,
  path: 'Learning/TypeScript/Generics.md',
  title: 'Generics',
  enrolled: true,
  generation: 'idle',
  generation_error: null,
  question_count: 4,
  stale: false,
  missing: false,
}

const question = {
  id,
  note_id: otherId,
  position: 1,
  prompt: 'What is a generic?',
  answer: 'A type parameter.',
  passage: 'Generics take type parameters.',
  state: 'active',
  fsrs_state: 'new',
  due: null,
  reps: 0,
  lapses: 0,
  last_review: null,
}

const counts = { due: 3, new_remaining: 5, learning_soon: 1 }

const grade = {
  verdict: 'partial',
  right: [ 'Mentions type parameters' ],
  missed: [ 'Constraints' ],
  feedback: 'Close; add constraints.',
  suggested_rating: 'hard',
}

describe( 'enums', () => {
  it( 'accepts the documented values and rejects others', () => {
    expect( MeleteRating.options ).toEqual( [ 'again', 'hard', 'good', 'easy' ] )
    expect( MeleteReviewMode.options ).toEqual( [ 'typed', 'quick' ] )
    expect( MeleteGeneration.options ).toEqual( [ 'idle', 'queued', 'generating', 'failed' ] )
    expect( MeleteQuestionState.options ).toEqual( [ 'active', 'dropped', 'retired' ] )
    expect( MeleteFsrsState.options ).toEqual( [ 'new', 'learning', 'review', 'relearning' ] )
    expect( accepts( MeleteRating, 'perfect' ) ).toBe( false )
  } )
} )

describe( 'MeleteSubject', () => {
  it( 'parses a subject', () => {
    expect( MeleteSubject.parse( subject ) ).toEqual( subject )
  } )

  it( 'limits new_per_day to 0..100', () => {
    expect( accepts( MeleteSubject, { ...subject, new_per_day: 0 } ) ).toBe( true )
    expect( accepts( MeleteSubject, { ...subject, new_per_day: 100 } ) ).toBe( true )
    expect( accepts( MeleteSubject, { ...subject, new_per_day: 101 } ) ).toBe( false )
    expect( accepts( MeleteSubject, { ...subject, new_per_day: -1 } ) ).toBe( false )
  } )

  it( 'rejects fractional and negative counts', () => {
    expect( accepts( MeleteSubject, { ...subject, note_count: 1.5 } ) ).toBe( false )
    expect( accepts( MeleteSubject, { ...subject, due_count: -1 } ) ).toBe( false )
  } )
} )

describe( 'MeleteNote', () => {
  it( 'parses a note and keeps a generation error', () => {
    expect( MeleteNote.parse( note ) ).toEqual( note )
    expect(
      MeleteNote.parse( { ...note, generation: 'failed', generation_error: 'Too long' } ),
    ).toMatchObject( { generation: 'failed', generation_error: 'Too long' } )
  } )

  it( 'rejects an unknown generation', () => {
    expect( accepts( MeleteNote, { ...note, generation: 'running' } ) ).toBe( false )
  } )
} )

describe( 'MeleteQuestion', () => {
  it( 'parses a new question with no due date', () => {
    expect( MeleteQuestion.parse( question ) ).toEqual( question )
  } )

  it( 'parses a scheduled question', () => {
    const scheduled = {
      ...question,
      fsrs_state: 'review',
      due: '2026-10-23T04:00:00.000Z',
      reps: 3,
      lapses: 1,
      last_review: '2026-10-22T04:00:00.000Z',
    }

    expect( MeleteQuestion.parse( scheduled ) ).toEqual( scheduled )
  } )

  it( 'rejects a bad due date', () => {
    expect( accepts( MeleteQuestion, { ...question, due: 'tomorrow' } ) ).toBe( false )
  } )
} )

describe( 'review items and counts', () => {
  it( 'parses counts', () => {
    expect( MeleteReviewCounts.parse( counts ) ).toEqual( counts )
  } )

  it( 'allows a null obsidian_url', () => {
    const item = {
      question,
      note: { id: otherId, title: 'Generics', path: note.path, subject_name: 'TypeScript' },
      obsidian_url: null,
    }

    expect( MeleteReviewItem.parse( item ) ).toEqual( item )
  } )
} )

describe( 'MeleteGrade', () => {
  it( 'parses a grade', () => {
    expect( MeleteGrade.parse( grade ) ).toEqual( grade )
    expect( MeleteGradeOutput.parse( grade ) ).toEqual( grade )
  } )

  it( 'never suggests easy', () => {
    expect( accepts( MeleteGrade, { ...grade, suggested_rating: 'easy' } ) ).toBe( false )
  } )

  it( 'caps right and missed at six items', () => {
    const six = Array.from( { length: 6 }, ( _, index ) => `Point ${ index }` )

    expect( accepts( MeleteGrade, { ...grade, right: six } ) ).toBe( true )
    expect( accepts( MeleteGrade, { ...grade, right: [ ...six, 'x' ] } ) ).toBe( false )
    expect( accepts( MeleteGrade, { ...grade, missed: [ ...six, 'x' ] } ) ).toBe( false )
  } )

  it( 'requires feedback of 1 to 600 characters', () => {
    expect( accepts( MeleteGrade, { ...grade, feedback: '' } ) ).toBe( false )
    expect( accepts( MeleteGrade, { ...grade, feedback: 'a'.repeat( 600 ) } ) ).toBe( true )
    expect( accepts( MeleteGrade, { ...grade, feedback: 'a'.repeat( 601 ) } ) ).toBe( false )
  } )

  it( 'rejects an unknown verdict', () => {
    expect( accepts( MeleteGrade, { ...grade, verdict: 'great' } ) ).toBe( false )
  } )
} )

describe( 'MeleteQuestionsOutput', () => {
  const generated = { prompt: 'Why?', answer: 'Because.', passage: '' }

  it( 'accepts 1 to 10 questions and an empty passage', () => {
    expect( accepts( MeleteQuestionsOutput, { questions: [ generated ] } ) ).toBe( true )
    expect(
      accepts( MeleteQuestionsOutput, { questions: Array( 10 ).fill( generated ) } ),
    ).toBe( true )
  } )

  it( 'rejects none or more than 10', () => {
    expect( accepts( MeleteQuestionsOutput, { questions: [] } ) ).toBe( false )
    expect(
      accepts( MeleteQuestionsOutput, { questions: Array( 11 ).fill( generated ) } ),
    ).toBe( false )
  } )

  it( 'caps the field lengths', () => {
    const parse = ( changes: object ): boolean => MeleteQuestionsOutput
      .safeParse( { questions: [ { ...generated, ...changes } ] } ).success

    expect( parse( { prompt: '' } ) ).toBe( false )
    expect( parse( { prompt: 'a'.repeat( 501 ) } ) ).toBe( false )
    expect( parse( { answer: '' } ) ).toBe( false )
    expect( parse( { answer: 'a'.repeat( 1501 ) } ) ).toBe( false )
    expect( parse( { passage: 'a'.repeat( 1501 ) } ) ).toBe( false )
    expect( parse( { prompt: 'a'.repeat( 500 ), answer: 'a'.repeat( 1500 ) } ) ).toBe( true )
  } )
} )

describe( 'API bodies', () => {
  it( 'requires at least one key in UpdateMeleteSubjectBody', () => {
    expect( accepts( UpdateMeleteSubjectBody, {} ) ).toBe( false )
    expect( accepts( UpdateMeleteSubjectBody, { auto_enroll: true } ) ).toBe( true )
    expect( accepts( UpdateMeleteSubjectBody, { new_per_day: 0 } ) ).toBe( true )
    expect( accepts( UpdateMeleteSubjectBody, { new_per_day: 101 } ) ).toBe( false )
  } )

  it( 'parses the enrollment bodies', () => {
    expect( EnrollSubjectBody.parse( { enrolled: true } ) ).toEqual( { enrolled: true } )
    expect( UpdateMeleteNoteBody.parse( { enrolled: false } ) ).toEqual( { enrolled: false } )
    expect( accepts( EnrollSubjectBody, {} ) ).toBe( false )
  } )

  it( 'limits the answer to 4000 characters', () => {
    expect( accepts( GradeAnswerBody, { answer: '' } ) ).toBe( true )
    expect( accepts( GradeAnswerBody, { answer: 'a'.repeat( 4000 ) } ) ).toBe( true )
    expect( accepts( GradeAnswerBody, { answer: 'a'.repeat( 4001 ) } ) ).toBe( false )
  } )

  it( 'parses RecordReviewBody with and without the optional fields', () => {
    expect( RecordReviewBody.parse( { rating: 'good', mode: 'quick' } ) )
      .toEqual( { rating: 'good', mode: 'quick' } )
    expect(
      RecordReviewBody.parse( {
        rating: 'easy',
        mode: 'typed',
        answer: 'text',
        grade_run_id: 7,
        suggested_rating: 'hard',
      } ),
    ).toMatchObject( { grade_run_id: 7, suggested_rating: 'hard' } )
    const quick = { rating: 'good', mode: 'quick' }

    expect( accepts( RecordReviewBody, { ...quick, answer: 'a'.repeat( 4001 ) } ) ).toBe( false )
    expect( accepts( RecordReviewBody, { ...quick, suggested_rating: 'easy' } ) ).toBe( false )
    expect( accepts( RecordReviewBody, { rating: 'good' } ) ).toBe( false )
  } )
} )

describe( 'GradeAnswerResponse', () => {
  it( 'parses graded, skipped and failed', () => {
    expect( GradeAnswerResponse.parse( { outcome: 'graded', grade, run_id: 4 } ) )
      .toMatchObject( { outcome: 'graded' } )
    expect( GradeAnswerResponse.parse( { outcome: 'skipped', reason: 'blank' } ) )
      .toEqual( { outcome: 'skipped', reason: 'blank' } )
    expect( GradeAnswerResponse.parse( { outcome: 'failed', reason: 'Timed out', run_id: null } ) )
      .toMatchObject( { outcome: 'failed', run_id: null } )
    expect( GradeAnswerResponse.parse( { outcome: 'failed', reason: 'Timed out', run_id: 9 } ) )
      .toMatchObject( { run_id: 9 } )
  } )

  it( 'rejects mixed shapes', () => {
    expect( accepts( GradeAnswerResponse, { outcome: 'graded', reason: 'blank' } ) ).toBe( false )
    expect( accepts( GradeAnswerResponse, { outcome: 'skipped', reason: 'other' } ) ).toBe( false )
    expect( accepts( GradeAnswerResponse, { outcome: 'failed', run_id: 1 } ) ).toBe( false )
    expect( accepts( GradeAnswerResponse, { outcome: 'unknown' } ) ).toBe( false )
  } )
} )

describe( 'responses', () => {
  it( 'requires the note response to say whether an Obsidian link exists', () => {
    expect( accepts( GetMeleteNoteResponse, { note, questions: [] } ) ).toBe( false )
    expect( accepts( GetMeleteNoteResponse, { note, questions: [], obsidian_url: null } ) )
      .toBe( true )
    expect( accepts( GetMeleteNoteResponse, {
      note,
      questions: [],
      obsidian_url: 'obsidian://open?vault=Brain&file=Learning%2FGenerics',
    } ) ).toBe( true )
  } )

  it( 'requires skipped_paths on the Today response, as strings', () => {
    const today = { learning_root: null, subjects: [], totals: counts }

    expect( accepts( GetMeleteTodayResponse, today ) ).toBe( false )
    expect( accepts( GetMeleteTodayResponse, { ...today, skipped_paths: [ 'A/B' ] } ) ).toBe( true )
    expect( accepts( GetMeleteTodayResponse, { ...today, skipped_paths: [ 1 ] } ) ).toBe( false )
    expect( accepts( GetMeleteTodayResponse, { ...today, skipped_paths: 'A' } ) ).toBe( false )
  } )

  it( 'parses each response shape', () => {
    expect( GetMeleteTodayResponse.parse( {
      learning_root: null,
      subjects: [],
      totals: counts,
      skipped_paths: [],
    } ) ).toMatchObject( { learning_root: null } )
    expect( GetMeleteTodayResponse.parse( {
      learning_root: 'Learning',
      subjects: [ subject ],
      totals: counts,
      skipped_paths: [ 'Learning/Locked' ],
    } ).subjects ).toHaveLength( 1 )
    expect( GetMeleteSubjectResponse.parse( { subject, notes: [ note ] } ).notes )
      .toHaveLength( 1 )
    expect( GetMeleteNoteResponse.parse( {
      note,
      questions: [ question ],
      obsidian_url: null,
    } ).questions ).toHaveLength( 1 )
    expect( GetNextReviewResponse.parse( { item: null, counts } ) )
      .toEqual( { item: null, counts } )
    expect( RecordReviewResponse.parse( { question, counts } ).counts ).toEqual( counts )
  } )
} )
