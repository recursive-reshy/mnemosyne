// Packages
import { describe, it, expect } from 'vitest'
import { Rating, State, createEmptyCard } from 'ts-fsrs'
// Config
import { config } from '../config.js'
// Melete
import {
  appScheduler,
  createScheduler,
  fromRow,
  newCard,
  nextCard,
  toFsrsRating,
  toRow,
} from './scheduler.js'

const now = new Date( '2026-10-22T08:00:00.000Z' )
const exact = createScheduler( { fuzz: false } )

const minutes = ( from: Date, to: string | null ): number => {
  return ( new Date( to ?? '' ).getTime() - from.getTime() ) / 60_000
}

describe( 'newCard', () => {
  it( 'is a new card due now with nothing reviewed', () => {
    const row = toRow( newCard( now ) )

    expect( row ).toMatchObject( {
      due: now.toISOString(),
      fsrs_state: 'new',
      reps: 0,
      lapses: 0,
      last_review: null,
    } )
  } )
} )

describe( 'toFsrsRating', () => {
  it( 'maps each app rating to the library rating', () => {
    expect( toFsrsRating( 'again' ) ).toBe( Rating.Again )
    expect( toFsrsRating( 'hard' ) ).toBe( Rating.Hard )
    expect( toFsrsRating( 'good' ) ).toBe( Rating.Good )
    expect( toFsrsRating( 'easy' ) ).toBe( Rating.Easy )
  } )
} )

describe( 'nextCard', () => {
  it( 'puts a new card rated again, hard or good into learning, due within the hour', () => {
    for( const rating of [ 'again', 'hard', 'good' ] as const ) {
      const row = toRow( nextCard( newCard( now ), rating, now, exact ) )

      expect( row.fsrs_state ).toBe( 'learning' )
      expect( row.reps ).toBe( 1 )
      expect( minutes( now, row.due ) ).toBeGreaterThan( 0 )
      expect( minutes( now, row.due ) ).toBeLessThan( 60 )
      expect( row.last_review ).toBe( now.toISOString() )
    }
  } )

  it( 'matches the library for the same input', () => {
    const expected = exact.next( createEmptyCard( now ), now, Rating.Good ).card

    expect( nextCard( newCard( now ), 'good', now, exact ).due ).toEqual( expected.due )
  } )

  it( 'sends a new card rated easy straight to review, a day or more out', () => {
    const row = toRow( nextCard( newCard( now ), 'easy', now, exact ) )

    expect( row.fsrs_state ).toBe( 'review' )
    expect( row.scheduled_days ).toBeGreaterThanOrEqual( 1 )
  } )

  it( 'schedules a review card further out after good than it was before', () => {
    const first = nextCard( newCard( now ), 'easy', now, exact )
    const later = new Date( first.due.getTime() )
    const second = nextCard( first, 'good', later, exact )

    expect( second.scheduled_days ).toBeGreaterThan( first.scheduled_days )
    expect( toRow( second ).fsrs_state ).toBe( 'review' )
  } )

  it( 'relearns a review card rated again and counts the lapse', () => {
    const first = nextCard( newCard( now ), 'easy', now, exact )
    const row = toRow( nextCard( first, 'again', first.due, exact ) )

    expect( row.fsrs_state ).toBe( 'relearning' )
    expect( row.lapses ).toBe( 1 )
  } )

  it( 'gives the same next card whether elapsed_days is 0 or the true value', () => {
    const first = nextCard( newCard( now ), 'easy', now, exact )
    const later = new Date( first.due.getTime() )
    const withZero = nextCard( { ...first, elapsed_days: 0 }, 'good', later, exact )
    const withTrue = nextCard(
      { ...first, elapsed_days: first.scheduled_days },
      'good',
      later,
      exact,
    )

    expect( toRow( withZero ) ).toEqual( toRow( withTrue ) )
  } )
} )

describe( 'toRow and fromRow', () => {
  it( 'round-trips every field, including the state name and the dates', () => {
    for( const state of [ 'new', 'learning', 'review', 'relearning' ] as const ) {
      const row = {
        due: '2026-10-23T08:00:00.000Z',
        stability: 3.5,
        difficulty: 6.25,
        scheduled_days: 2,
        learning_steps: 1,
        reps: 4,
        lapses: 1,
        fsrs_state: state,
        last_review: '2026-10-21T08:00:00.000Z',
      }

      expect( toRow( fromRow( row ) ) ).toEqual( row )
    }
  } )

  it( 'reads a row without a last review as a card with none', () => {
    const card = fromRow( toRow( newCard( now ) ) )

    expect( card.last_review ).toBeUndefined()
    expect( card.state ).toBe( State.New )
  } )

  it( 'reads a row that was never scheduled as due now-ish', () => {
    const card = fromRow( {
      ...toRow( newCard( now ) ),
      due: null,
    }, now )

    expect( card.due ).toEqual( now )
  } )

  it( 'restores elapsed_days as 0', () => {
    expect( fromRow( toRow( newCard( now ) ) ).elapsed_days ).toBe( 0 )
  } )
} )

describe( 'appScheduler', () => {
  it( 'has fuzz on and the configured target recall', () => {
    expect( appScheduler().parameters.enable_fuzz ).toBe( true )
    expect( appScheduler().parameters.enable_short_term ).toBe( true )
    expect( appScheduler().parameters.request_retention ).toBe( config.melete.requestRetention )
  } )

  it( 'is exact when fuzz is turned off', () => {
    expect( exact.parameters.enable_fuzz ).toBe( false )
  } )
} )
