// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Test support
import { addNote, addQuestion, addSubject } from '../test-support/meleteData.fixture.js'
// Repositories
import { getDatabase } from './database.js'
import { countNewReviewedSince, insertReview } from './meleteReviews.repository.js'
import type { NewReview } from './meleteReviews.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

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
    const questionId = addQuestion( userId, addNote( userId, addSubject( userId ) ) )
    const id = insertReview( userId, review( questionId ) )

    expect( id ).toBeGreaterThan( 0 )
    expect( getDatabase().prepare( 'SELECT * FROM melete_reviews WHERE id = ?' ).get( id ) )
      .toEqual( {
        id,
        user_id: userId,
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
    const questionId = addQuestion( userId, addNote( userId, addSubject( userId ) ) )
    const id = insertReview( userId, review( questionId, {
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
    expect( () => insertReview( userId, review( crypto.randomUUID() ) ) ).toThrow()
  } )
} )

describe( 'countNewReviewedSince', () => {
  const since = '2026-10-22T04:00:00.000Z'

  it( 'counts reviews of new questions in a subject from the cut-off on', () => {
    const subjectId = addSubject( userId )
    const noteId = addNote( userId, subjectId )
    const a = addQuestion( userId, noteId, { position: 1 } )
    const b = addQuestion( userId, noteId, { position: 2 } )

    insertReview( userId, review( a, { reviewed_at: '2026-10-22T04:00:00.000Z' } ) )
    insertReview( userId, review( b, { reviewed_at: '2026-10-22T11:00:00.000Z' } ) )

    expect( countNewReviewedSince( userId, subjectId, since ) ).toBe( 2 )
  } )

  it( 'ignores reviews before the cut-off and reviews of questions that were not new', () => {
    const subjectId = addSubject( userId )
    const noteId = addNote( userId, subjectId )
    const a = addQuestion( userId, noteId, { position: 1 } )
    const b = addQuestion( userId, noteId, { position: 2 } )

    insertReview( userId, review( a, { reviewed_at: '2026-10-22T03:59:59.000Z' } ) )
    insertReview( userId, review( b, { was_new: false } ) )

    expect( countNewReviewedSince( userId, subjectId, since ) ).toBe( 0 )
  } )

  it( 'counts each subject on its own', () => {
    const subjectId = addSubject( userId, 'Learning/TS' )
    const otherId = addSubject( userId, 'Learning/Rust' )

    insertReview( userId, review( addQuestion( userId, addNote( userId, subjectId ) ) ) )
    insertReview( userId, review( addQuestion( userId, addNote( userId, otherId ) ) ) )
    insertReview( userId, review( addQuestion( userId, addNote( userId, otherId ) ) ) )

    expect( countNewReviewedSince( userId, subjectId, since ) ).toBe( 1 )
    expect( countNewReviewedSince( userId, otherId, since ) ).toBe( 2 )
  } )

  it( 'still counts reviews of questions that were dropped or retired afterwards', () => {
    const subjectId = addSubject( userId )
    const questionId = addQuestion( userId, addNote( userId, subjectId ), { state: 'retired' } )

    insertReview( userId, review( questionId ) )

    expect( countNewReviewedSince( userId, subjectId, since ) ).toBe( 1 )
  } )
} )

describe( 'ownership', () => {
  it( 'counts the new questions a user reviewed, not another user\'s', () => {
    const other = createTestUser().id
    const subjectId = addSubject( userId )
    const questionId = addQuestion( userId, addNote( userId, subjectId ) )

    insertReview( userId, review( questionId ) )

    expect( countNewReviewedSince( userId, subjectId, '2026-10-22T00:00:00.000Z' ) ).toBe( 1 )
    expect( countNewReviewedSince( other, subjectId, '2026-10-22T00:00:00.000Z' ) ).toBe( 0 )
  } )

  it( 'stamps each review with its user', () => {
    const other = createTestUser().id
    const questionId = addQuestion( userId, addNote( userId, addSubject( userId ) ) )

    insertReview( userId, review( questionId ) )
    insertReview( other, review( questionId ) )

    expect( getDatabase().prepare( 'SELECT user_id FROM melete_reviews ORDER BY id' ).all() )
      .toEqual( [ { user_id: userId }, { user_id: other } ] )
  } )
} )
