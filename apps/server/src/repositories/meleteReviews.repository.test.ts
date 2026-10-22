// Packages
import { describe, it, expect } from 'vitest'
// Test support
import { addNote, addQuestion, addSubject } from '../test-support/meleteData.fixture.js'
// Repositories
import { getDatabase } from './database.js'
import { countNewReviewedSince, insertReview } from './meleteReviews.repository.js'
import type { NewReview } from './meleteReviews.repository.js'

const review = ( questionId: string, overrides: Partial< NewReview > = {} ): NewReview => {
  return {
    question_id: questionId,
    reviewed_at: '2026-10-22T10:00:00.000Z',
    mode: 'typed',
    rating: 'good',
    suggested_rating: 'hard',
    answer: 'My answer',
    grade_run_id: 3,
    was_new: true,
    before_state: '{"state":0}',
    ...overrides,
  }
}

describe( 'insertReview', () => {
  it( 'stores a review and returns its id', () => {
    const questionId = addQuestion( addNote( addSubject() ) )
    const id = insertReview( review( questionId ) )

    expect( id ).toBeGreaterThan( 0 )
    expect( getDatabase().prepare( 'SELECT * FROM melete_reviews WHERE id = ?' ).get( id ) )
      .toEqual( {
        id,
        question_id: questionId,
        reviewed_at: '2026-10-22T10:00:00.000Z',
        mode: 'typed',
        rating: 'good',
        suggested_rating: 'hard',
        answer: 'My answer',
        grade_run_id: 3,
        was_new: 1,
        before_state: '{"state":0}',
      } )
  } )

  it( 'stores a quick review with no answer, suggestion or grading run', () => {
    const questionId = addQuestion( addNote( addSubject() ) )
    const id = insertReview( review( questionId, {
      mode: 'quick',
      suggested_rating: null,
      answer: null,
      grade_run_id: null,
      was_new: false,
    } ) )

    expect( getDatabase().prepare( 'SELECT * FROM melete_reviews WHERE id = ?' ).get( id ) )
      .toMatchObject( {
        mode: 'quick',
        suggested_rating: null,
        answer: null,
        grade_run_id: null,
        was_new: 0,
      } )
  } )

  it( 'refuses a review of an unknown question', () => {
    expect( () => insertReview( review( crypto.randomUUID() ) ) ).toThrow()
  } )
} )

describe( 'countNewReviewedSince', () => {
  const since = '2026-10-22T04:00:00.000Z'

  it( 'counts reviews of new questions in a subject from the cut-off on', () => {
    const subjectId = addSubject()
    const noteId = addNote( subjectId )
    const a = addQuestion( noteId, { position: 1 } )
    const b = addQuestion( noteId, { position: 2 } )

    insertReview( review( a, { reviewed_at: '2026-10-22T04:00:00.000Z' } ) )
    insertReview( review( b, { reviewed_at: '2026-10-22T11:00:00.000Z' } ) )

    expect( countNewReviewedSince( subjectId, since ) ).toBe( 2 )
  } )

  it( 'ignores reviews before the cut-off and reviews of questions that were not new', () => {
    const subjectId = addSubject()
    const noteId = addNote( subjectId )
    const a = addQuestion( noteId, { position: 1 } )
    const b = addQuestion( noteId, { position: 2 } )

    insertReview( review( a, { reviewed_at: '2026-10-22T03:59:59.000Z' } ) )
    insertReview( review( b, { was_new: false } ) )

    expect( countNewReviewedSince( subjectId, since ) ).toBe( 0 )
  } )

  it( 'counts each subject on its own', () => {
    const subjectId = addSubject( 'Learning/TS' )
    const otherId = addSubject( 'Learning/Rust' )

    insertReview( review( addQuestion( addNote( subjectId ) ) ) )
    insertReview( review( addQuestion( addNote( otherId ) ) ) )
    insertReview( review( addQuestion( addNote( otherId ) ) ) )

    expect( countNewReviewedSince( subjectId, since ) ).toBe( 1 )
    expect( countNewReviewedSince( otherId, since ) ).toBe( 2 )
  } )

  it( 'still counts reviews of questions that were dropped or retired afterwards', () => {
    const subjectId = addSubject()
    const questionId = addQuestion( addNote( subjectId ), { state: 'retired' } )

    insertReview( review( questionId ) )

    expect( countNewReviewedSince( subjectId, since ) ).toBe( 1 )
  } )
} )
