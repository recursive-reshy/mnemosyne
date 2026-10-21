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
import { ModelsTab } from './ModelsTab'

vi.mock( '../SummarizerDefaults', () => ( { SummarizerDefaults: () => <p>defaults</p> } ) )
vi.mock( '../LinkingSettings', () => ( { LinkingSettings: () => <p>linking</p> } ) )

describe( 'ModelsTab', () => {
  it( 'has the Summarizer and Linking sections', () => {
    renderWithClient( <ModelsTab /> )

    expect( screen.getByRole( 'heading', { level: 3, name: 'Summarizer' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { level: 3, name: 'Linking' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'defaults' ) ).toBeInTheDocument()
    expect( screen.getByText( 'linking' ) ).toBeInTheDocument()
  } )

  it( 'has no prompt editors or locked instructions', () => {
    renderWithClient( <ModelsTab /> )

    expect( screen.queryByText( /instructions/i ) ).not.toBeInTheDocument()
    expect( screen.queryByText( /prompt/i ) ).not.toBeInTheDocument()
  } )
} )
