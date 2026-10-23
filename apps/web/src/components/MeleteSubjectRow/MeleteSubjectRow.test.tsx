// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { meleteSubjectFixture, SUBJECT_ID } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteSubjectRow } from './MeleteSubjectRow'

describe( 'MeleteSubjectRow', () => {
  it( 'links the name to the subject page and shows its counts', () => {
    renderWithClient( <MeleteSubjectRow subject={ meleteSubjectFixture() } /> )

    expect( screen.getByRole( 'link', { name: 'TypeScript' } ) )
      .toHaveAttribute( 'href', `/melete/subjects/${ SUBJECT_ID }` )
    expect( screen.getByText( '4 due · 5 new · 3 of 8 enrolled' ) ).toBeInTheDocument()
  } )

  it( 'offers a review of just this subject', () => {
    renderWithClient( <MeleteSubjectRow subject={ meleteSubjectFixture() } /> )

    const review = screen.getByRole( 'link', { name: 'Review TypeScript' } )
    expect( review ).toHaveAttribute( 'href', `/melete/review?subject=${ SUBJECT_ID }` )
    expect( review ).not.toHaveAttribute( 'aria-disabled' )
  } )

  it( 'disables the review when nothing is due or new', () => {
    const subject = meleteSubjectFixture( { due_count: 0, new_remaining_today: 0 } )
    renderWithClient( <MeleteSubjectRow subject={ subject } /> )

    expect( screen.getByRole( 'link', { name: 'Review TypeScript' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )
  } )
} )
