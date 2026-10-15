// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { jobFixture } from '#src/test-support/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewScreen } from './ReviewScreen'

const reviewJob = jobFixture( {
  status: 'ready_for_review',
  title: 'How Rust Works',
  summary_markdown: '## Summary\nText.',
  suggested_tags: [ 'rust' ],
} )

describe( 'ReviewScreen title', () => {
  it( 'starts with the job title and shows the file name it will get', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } /> )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'How Rust Works' )
    expect( screen.getByText( 'Mnemosyne/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'updates the file name as the title is edited', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } /> )
    const user = userEvent.setup()
    const field = screen.getByRole( 'textbox', { name: 'Title' } )

    await user.clear( field )
    await user.type( field, 'New: Name' )

    expect( screen.getByText( 'Mnemosyne/New Name.md' ) ).toBeInTheDocument()
  } )

  it( 'has no title field when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ { ...reviewJob, status: 'summary_failed', error: 'x' } } />,
    )

    expect( screen.queryByRole( 'textbox', { name: 'Title' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen tags', () => {
  it( 'starts with mnemosyne and the suggested tags and lets the user edit them', async () => {
    renderWithClient( <ReviewScreen job={ { ...reviewJob, suggested_tags: [ 'rust', 'go' ] } } /> )
    const user = userEvent.setup()

    const names = (): string[] => {
      return within( screen.getByRole( 'list', { name: 'Tags' } ) )
        .getAllByRole( 'listitem' )
        .map( ( item ) => ( item.textContent ?? '' ).replace( '×', '' ) )
    }

    expect( names().join( ',' ) ).toBe( 'mnemosyne,rust,go' )

    await user.click( screen.getByRole( 'button', { name: 'Remove tag rust' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Add tag' } ), 'ai{Enter}' )

    expect( names().join( ',' ) ).toBe( 'mnemosyne,go,ai' )
  } )
} )
