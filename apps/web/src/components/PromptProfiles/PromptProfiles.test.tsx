// Testing Library
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
import { useSettings } from '#src/hooks/useSettings'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  BUSINESS_ID,
  CODING_ID,
  profileFixture,
  profilesFixture,
  settingsFixture,
} from '#src/test-support/summarizer.fixture'
import { PromptProfiles } from './PromptProfiles'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )
vi.mock( '../PromptHistory', () => ( {
  PromptHistory: ( props: {
    profileId: string
    currentVersionId: number
    isRestoring: boolean
    onRestore: ( versionId: number ) => void
  } ) => (
    <div>
      <p>{ `history of ${ props.profileId } at ${ props.currentVersionId }` }</p>
      <button onClick={ () => props.onRestore( 7 ) }>restore version 7</button>
    </div>
  ),
} ) )

const mockedSettings = vi.mocked( useSettings )
const mockedProfiles = vi.mocked( usePromptProfiles )

type ProfilesState = ReturnType< typeof usePromptProfiles >

// A mutation that succeeds at once, like a server that answered.
type Options = { onSuccess?: ( ...args: unknown[] ) => void }

// `never` lets the stub stand in for whichever mutation the test gives it to.
const succeeding = ( data?: unknown ): { stub: never, mutate: ReturnType< typeof vi.fn > } => {
  const mutate = vi.fn( ( variables: unknown, options?: Options ) => {
    options?.onSuccess?.( data, variables, undefined )
  } )

  return { stub: mutationStub< never >( { mutate } ), mutate }
}

const state = ( overrides: Partial< ProfilesState > = {} ): ProfilesState => ( {
  profiles: profilesFixture(),
  isLoading: false,
  error: null,
  createProfile: mutationStub(),
  renameProfile: mutationStub(),
  deleteProfile: mutationStub(),
  saveVersion: mutationStub(),
  restoreVersion: mutationStub(),
  resetProfile: mutationStub(),
  ...overrides,
} )

const guidanceField = (): HTMLElement => screen.getByRole( 'textbox', { name: 'Guidance' } )
const dialogClosed = async (): Promise< void > => {
  await waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
}
const picker = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Prompt profile' } )

type User = ReturnType< typeof userEvent.setup >

const choose = async ( user: User, name: string ): Promise< void > => {
  await user.click( picker() )
  await user.click( screen.getByRole( 'option', { name } ) )
}

beforeEach( () => {
  mockedSettings.mockReturnValue( {
    settings: settingsFixture().settings,
    lockedInstructions: 'locked',
    isLoading: false,
    error: null,
    updateSettings: mutationStub(),
  } )
  mockedProfiles.mockReturnValue( state() )
} )

describe( 'PromptProfiles, choosing a profile', () => {
  it( 'starts on the default profile, marked as the default', () => {
    renderWithClient( <PromptProfiles /> )

    expect( picker() ).toHaveTextContent( 'Business ideas (default)' )
    expect( guidanceField() ).toHaveValue( 'Focus on ideas worth exploring.' )
  } )

  it( 'shows another profile\'s guidance when chosen', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptProfiles /> )

    await choose( user, 'Coding' )

    expect( guidanceField() ).toHaveValue( 'Focus on techniques.' )
  } )

  it( 'announces loading while the profiles load', () => {
    mockedProfiles.mockReturnValue( state( { profiles: [], isLoading: true } ) )
    renderWithClient( <PromptProfiles /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading prompt profiles…' )
  } )

  it( 'shows an error when the profiles cannot be loaded', () => {
    mockedProfiles.mockReturnValue( state( { profiles: [], error: 'Could not reach the server' } ) )
    renderWithClient( <PromptProfiles /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )
} )

describe( 'PromptProfiles, unsaved changes', () => {
  it( 'asks before switching away from an edit, and switches on confirm', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptProfiles /> )
    await user.type( guidanceField(), ' more' )

    await choose( user, 'Coding' )

    expect( screen.getByRole( 'dialog', { name: 'Discard unsaved changes?' } ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Discard' } ) )
    await dialogClosed()

    expect( guidanceField() ).toHaveValue( 'Focus on techniques.' )
  } )

  it( 'stays on the profile and keeps the edit when the switch is cancelled', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptProfiles /> )
    await user.type( guidanceField(), ' more' )

    await choose( user, 'Coding' )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )
    await dialogClosed()

    expect( picker() ).toHaveTextContent( 'Business ideas' )
    expect( guidanceField() ).toHaveValue( 'Focus on ideas worth exploring. more' )
    expect( screen.getByText( 'Unsaved changes' ) ).toBeInTheDocument()
  } )

  it( 'switches without asking when nothing was edited', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptProfiles /> )

    await choose( user, 'Coding' )

    expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument()
  } )

  it( 'discards the edit', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptProfiles /> )
    await user.type( guidanceField(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'Discard changes' } ) )

    expect( guidanceField() ).toHaveValue( 'Focus on ideas worth exploring.' )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'warns the browser while there is an edit, and not otherwise', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptProfiles /> )
    const clean = new Event( 'beforeunload', { cancelable: true } )
    window.dispatchEvent( clean )

    await user.type( guidanceField(), ' more' )
    const dirty = new Event( 'beforeunload', { cancelable: true } )
    window.dispatchEvent( dirty )

    expect( clean.defaultPrevented ).toBe( false )
    expect( dirty.defaultPrevented ).toBe( true )
  } )
} )

describe( 'PromptProfiles, saving', () => {
  it( 'saves the edit as a new version and clears the edit marker', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture() )
    mockedProfiles.mockReturnValue( state( { saveVersion: stub } ) )
    renderWithClient( <PromptProfiles /> )
    await user.type( guidanceField(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'Save' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: BUSINESS_ID, guidance: 'Focus on ideas worth exploring. more' },
      expect.anything(),
    )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'resets to the shipped text after confirming, and clears the edit', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture() )
    mockedProfiles.mockReturnValue( state( { resetProfile: stub } ) )
    renderWithClient( <PromptProfiles /> )
    await user.type( guidanceField(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'Reset to default' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Reset' } ) )

    expect( mutate ).toHaveBeenCalledWith( BUSINESS_ID, expect.anything() )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )

  it( 'does not offer Reset to default for a profile the user made', () => {
    const custom = profileFixture( { id: 'c', name: 'Mine', can_reset: false } )
    mockedProfiles.mockReturnValue( state( { profiles: [ ...profilesFixture(), custom ] } ) )
    mockedSettings.mockReturnValue( {
      ...mockedSettings(),
      settings: settingsFixture( { default_profile_id: 'c' } ).settings,
    } )
    renderWithClient( <PromptProfiles /> )

    expect( screen.queryByRole( 'button', { name: 'Reset to default' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'PromptProfiles, new and rename', () => {
  it( 'creates a profile from the viewed one and switches to it', async () => {
    const user = userEvent.setup()
    const created = profileFixture( { id: 'new-id', name: 'Research' } )
    const { stub, mutate } = succeeding( created )
    mockedProfiles.mockReturnValue( state( { createProfile: stub } ) )
    renderWithClient( <PromptProfiles /> )

    await user.click( screen.getByRole( 'button', { name: 'New profile' } ) )

    expect( screen.getByRole( 'dialog', { name: 'New profile' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Guidance' } ) )
      .toHaveValue( 'Focus on ideas worth exploring.' )

    mockedProfiles.mockReturnValue( state( {
      createProfile: stub,
      profiles: [ ...profilesFixture(), created ],
    } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Name' } ), 'Research' )
    await user.click( screen.getByRole( 'button', { name: 'Create' } ) )
    await dialogClosed()

    expect( mutate ).toHaveBeenCalledWith(
      { name: 'Research', guidance: 'Focus on ideas worth exploring.' },
      expect.anything(),
    )
    expect( picker() ).toHaveTextContent( 'Research' )
  } )

  it( 'keeps the dialog open and shows the message when the name is taken', async () => {
    const user = userEvent.setup()
    mockedProfiles.mockReturnValue( state( {
      createProfile: mutationStub( {
        isError: true,
        error: new Error( 'A profile with that name already exists' ),
      } ),
    } ) )
    renderWithClient( <PromptProfiles /> )

    await user.click( screen.getByRole( 'button', { name: 'New profile' } ) )

    expect( screen.getByRole( 'dialog', { name: 'New profile' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'A profile with that name already exists' )
  } )

  it( 'renames the viewed profile', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture( { name: 'Biz' } ) )
    mockedProfiles.mockReturnValue( state( { renameProfile: stub } ) )
    renderWithClient( <PromptProfiles /> )

    await user.click( screen.getByRole( 'button', { name: 'Rename' } ) )
    const name = screen.getByRole( 'textbox', { name: 'Name' } )
    expect( name ).toHaveValue( 'Business ideas' )
    await user.clear( name )
    await user.type( name, 'Biz' )
    await user.click( screen.getByRole( 'button', { name: 'Rename' } ) )
    await dialogClosed()

    expect( mutate ).toHaveBeenCalledWith( { id: BUSINESS_ID, name: 'Biz' }, expect.anything() )
  } )
} )

describe( 'PromptProfiles, deleting', () => {
  it( 'cannot delete the default profile', () => {
    renderWithClient( <PromptProfiles /> )

    expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toBeDisabled()
  } )

  it( 'cannot delete the last remaining profile', async () => {
    const user = userEvent.setup()
    mockedProfiles.mockReturnValue( state( { profiles: profilesFixture().slice( 1, 2 ) } ) )
    renderWithClient( <PromptProfiles /> )

    await user.hover( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toBeDisabled()
    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( /last remaining profile/ )
  } )

  it( 'deletes another profile after confirming, and goes back to the default', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding()
    mockedProfiles.mockReturnValue( state( { deleteProfile: stub } ) )
    renderWithClient( <PromptProfiles /> )
    await choose( user, 'Coding' )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )

    expect( screen.getByRole( 'dialog', { name: 'Delete this profile?' } ) )
      .toHaveTextContent( 'Coding' )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )
    await dialogClosed()

    expect( mutate ).toHaveBeenCalledWith( CODING_ID, expect.anything() )
    expect( picker() ).toHaveTextContent( 'Business ideas (default)' )
  } )

  it( 'does not delete when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding()
    mockedProfiles.mockReturnValue( state( { deleteProfile: stub } ) )
    renderWithClient( <PromptProfiles /> )
    await choose( user, 'General' )

    await user.click( screen.getByRole( 'button', { name: 'Delete' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )
    await dialogClosed()

    expect( mutate ).not.toHaveBeenCalled()
    expect( picker() ).toHaveTextContent( 'General' )
  } )
} )

describe( 'PromptProfiles, editing the field', () => {
  it( 'marks edits as unsaved and enables Save', () => {
    renderWithClient( <PromptProfiles /> )

    fireEvent.change( guidanceField(), { target: { value: 'Something else' } } )

    expect( screen.getByText( 'Unsaved changes' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Save' } ) ).toBeEnabled()
  } )

  it( 'treats a change that only adds trailing whitespace as unchanged', () => {
    renderWithClient( <PromptProfiles /> )

    const value = 'Focus on ideas worth exploring.  \n'
    fireEvent.change( guidanceField(), { target: { value } } )

    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'PromptProfiles, history', () => {
  it( 'shows the history of the viewed profile', async () => {
    const user = userEvent.setup()
    renderWithClient( <PromptProfiles /> )

    expect( screen.getByText( `history of ${ BUSINESS_ID } at 1` ) ).toBeInTheDocument()

    await choose( user, 'Coding' )

    expect( screen.getByText( `history of ${ CODING_ID } at 2` ) ).toBeInTheDocument()
  } )

  it( 'restores a version and drops any edit', async () => {
    const user = userEvent.setup()
    const { stub, mutate } = succeeding( profileFixture() )
    mockedProfiles.mockReturnValue( state( { restoreVersion: stub } ) )
    renderWithClient( <PromptProfiles /> )
    await user.type( guidanceField(), ' more' )

    await user.click( screen.getByRole( 'button', { name: 'restore version 7' } ) )

    expect( mutate ).toHaveBeenCalledWith(
      { id: BUSINESS_ID, versionId: 7 },
      expect.anything(),
    )
    expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument()
    expect( guidanceField() ).toHaveValue( 'Focus on ideas worth exploring.' )
  } )
} )
