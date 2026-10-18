// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useSettings } from '#src/hooks/useSettings'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { mutationStub } from '#src/test-support/mutationStub'
import { settingsFixture } from '#src/test-support/summarizer.fixture'
import { SettingsPage } from './SettingsPage'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '../SummarizerDefaults', () => ( { SummarizerDefaults: () => <p>defaults</p> } ) )
vi.mock( '../PromptProfiles', () => ( { PromptProfiles: () => <p>profiles</p> } ) )
vi.mock( '../LockedInstructions', () => ( {
  LockedInstructions: ( { text }: { text: string } ) => <p>{ `locked: ${ text }` }</p>,
} ) )

const mockedSettings = vi.mocked( useSettings )

type State = ReturnType< typeof useSettings >

const state = ( overrides: Partial< State > = {} ): State => ( {
  settings: settingsFixture().settings,
  lockedInstructions: settingsFixture().locked_instructions.video,
  isLoading: false,
  error: null,
  updateSettings: mutationStub(),
  ...overrides,
} )

beforeEach( () => {
  mockedSettings.mockReturnValue( state() )
} )

describe( 'SettingsPage', () => {
  it( 'has the title and the Summarizer section with its parts', () => {
    renderWithClient( <SettingsPage /> )

    expect( screen.getByRole( 'heading', { level: 2, name: 'Settings' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'heading', { level: 3, name: 'Summarizer' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'defaults' ) ).toBeInTheDocument()
    expect( screen.getByText( 'profiles' ) ).toBeInTheDocument()
    expect( screen.getByText( `locked: ${ settingsFixture().locked_instructions.video }` ) )
      .toBeInTheDocument()
  } )

  it( 'announces loading and holds back the sections', () => {
    mockedSettings.mockReturnValue(
      state( { settings: null, lockedInstructions: null, isLoading: true } ),
    )
    renderWithClient( <SettingsPage /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading settings…' )
    expect( screen.queryByText( 'defaults' ) ).not.toBeInTheDocument()
  } )

  it( 'shows an error when the settings cannot be loaded', () => {
    mockedSettings.mockReturnValue( state( {
      settings: null,
      lockedInstructions: null,
      error: 'Could not reach the server',
    } ) )
    renderWithClient( <SettingsPage /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.queryByText( 'defaults' ) ).not.toBeInTheDocument()
  } )
} )
