// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { JobHeading } from './JobHeading'

describe( 'JobHeading', () => {
  it( 'shows the title as a heading', () => {
    renderWithClient( <JobHeading title="A post" feedName={ null } /> )

    expect( screen.getByRole( 'heading', { level: 2, name: 'A post' } ) ).toBeInTheDocument()
    expect( screen.queryByTestId( 'RssFeedIcon' ) ).not.toBeInTheDocument()
  } )

  it( 'adds the feed name beside it for a feed job, outside the heading', () => {
    renderWithClient( <JobHeading title="A post" feedName="Example Blog" /> )

    expect( screen.getByRole( 'heading', { name: 'A post' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Example Blog' ) ).toBeInTheDocument()
  } )
} )
