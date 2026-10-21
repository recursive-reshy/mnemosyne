// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SourcesTab } from './SourcesTab'

vi.mock( '../FeedSettings', () => ( { FeedSettings: () => <p>feeds</p> } ) )
vi.mock( '../GmailSettings', () => ( { GmailSettings: () => <p>gmail</p> } ) )

describe( 'SourcesTab', () => {
  it( 'has the feeds and the Gmail sections', () => {
    renderWithClient( <SourcesTab /> )

    expect( screen.getByText( 'feeds' ) ).toBeInTheDocument()
    expect( screen.getByText( 'gmail' ) ).toBeInTheDocument()
  } )
} )
