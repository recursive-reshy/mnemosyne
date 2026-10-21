// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { usePromptVersions } from '#src/hooks/usePromptVersions'
import { useSettings } from '#src/hooks/useSettings'
import { profilesState, settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { LINKER_ID, versionFixture } from '#src/test-support/summarizer.fixture'
import { LinkerPrompt } from './LinkerPrompt'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )
vi.mock( '#src/hooks/usePromptVersions' )

const newest = versionFixture( {
  id: 12,
  profile_id: LINKER_ID,
  version: 2,
  source: 'edit',
  guidance: 'Link only strong matches.',
} )
const oldest = versionFixture( {
  id: 11,
  profile_id: LINKER_ID,
  version: 1,
  source: 'seed',
  guidance: 'Shipped linker guidance.',
} )

const versionsState = ( overrides = {} ) => ( {
  versions: [ newest, oldest ],
  isLoading: false,
  error: null,
  ...overrides,
} )

const field = (): HTMLElement => screen.getByRole( 'textbox', { name: 'Guidance' } )

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
  vi.mocked( usePromptVersions ).mockReturnValue( versionsState() )
} )

describe( 'LinkerPrompt', () => {
  it( 'asks for the versions of the linker profile and shows the newest as the guidance', () => {
    renderWithClient( <LinkerPrompt /> )

    expect( usePromptVersions ).toHaveBeenCalledWith( LINKER_ID )
    expect( field() ).toHaveValue( 'Link only strong matches.' )
  } )

  it( 'saves an edit as a new version of the linker profile', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { saveVersion: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <LinkerPrompt /> )

    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeDisabled()

    await user.clear( field() )
    await user.type( field(), 'Link everything.' )

    expect( screen.getByText( 'Unsaved changes' ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: LINKER_ID, guidance: 'Link everything.' },
      expect.anything(),
    )
  } )

  it( 'discards an edit', async () => {
    const user = userEvent.setup()
    renderWithClient( <LinkerPrompt /> )

    await user.type( field(), ' More.' )
    await user.click( screen.getByRole( 'button', { name: 'Discard changes' } ) )

    expect( field() ).toHaveValue( 'Link only strong matches.' )
  } )

  it( 'resets to the shipped prompt after a confirm', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { resetProfile: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <LinkerPrompt /> )

    await user.click( screen.getByRole( 'button', { name: 'Reset to default' } ) )

    expect( mutate ).not.toHaveBeenCalled()

    await user.click( screen.getByRole( 'button', { name: 'Reset' } ) )

    expect( mutate ).toHaveBeenCalledWith( LINKER_ID, expect.anything() )
  } )

  it( 'lists the history, marks the current version and restores an older one', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { restoreVersion: mutationStub( { mutate } ) } ),
    )
    renderWithClient( <LinkerPrompt /> )

    expect( screen.getByText( 'current' ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: /^v1 / } ) )
    await user.click( screen.getByRole( 'button', { name: 'Restore this version' } ) )

    expect( mutate ).toHaveBeenCalledWith( { id: LINKER_ID, versionId: 11 }, expect.anything() )
  } )

  it( 'shows the error of a failed save', () => {
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( {
      saveVersion: mutationStub( { isError: true, error: new Error( 'Guidance is too long' ) } ),
    } ) )
    renderWithClient( <LinkerPrompt /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Guidance is too long' )
  } )

  it( 'announces loading', () => {
    vi.mocked( usePromptVersions ).mockReturnValue(
      versionsState( { versions: [], isLoading: true } ),
    )
    renderWithClient( <LinkerPrompt /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading the linker prompt…' )
    expect( screen.queryByRole( 'textbox', { name: 'Guidance' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows an error when the versions cannot be loaded', () => {
    vi.mocked( usePromptVersions ).mockReturnValue(
      versionsState( { versions: [], error: 'Could not reach the server' } ),
    )
    renderWithClient( <LinkerPrompt /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )
} )
