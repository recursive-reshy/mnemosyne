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
import { getGmailAccount } from '#src/api/gmail.api'
import { useMeleteProfiles } from '#src/hooks/useMeleteProfiles'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { gmailAccountFixture } from '#src/test-support/gmail.fixture'
import {
  meleteProfilesState,
  profilesState,
  settingsState,
} from '#src/test-support/hookStates'
import { mockMatchMedia } from '#src/test-support/matchMedia'
import { renderWithRouter } from '#src/test-support/renderWithRouter'
import { BUSINESS_ID, CODING_ID } from '#src/test-support/summarizer.fixture'

vi.mock( '#src/api/gmail.api' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/usePromptProfiles' )
vi.mock( '#src/hooks/useMeleteProfiles' )
vi.mock( '../ModelsTab', () => ( { ModelsTab: () => <p>models content</p> } ) )
vi.mock( '../SourcesTab', () => ( { SourcesTab: () => <p>sources content</p> } ) )
vi.mock( '../PromptList', () => ( {
  PromptList: ( props: { selectedId: string | null, meleteProfiles: unknown[] } ) => (
    <>
      <p>{ `list, selected ${ props.selectedId ?? 'none' }` }</p>
      <p>{ `${ props.meleteProfiles.length } Melete prompts in the list` }</p>
    </>
  ),
} ) )
vi.mock( '../ProfileManager', () => ( {
  ProfileManager: ( props: { selectedId: string | null } ) => (
    <p>{ `manager for ${ props.selectedId ?? 'none' }` }</p>
  ),
} ) )
vi.mock( '../PromptPanel', () => ( {
  PromptPanel: ( props: { promptId: string } ) => <p>{ `panel for ${ props.promptId }` }</p>,
} ) )

beforeEach( () => {
  mockMatchMedia()
  vi.mocked( getGmailAccount ).mockResolvedValue( gmailAccountFixture() )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
  vi.mocked( useMeleteProfiles ).mockReturnValue( meleteProfilesState() )
} )

describe( 'PromptsTab, wide window', () => {
  it( 'gives the list the Melete prompts', () => {
    renderWithRouter( `/settings/prompts/${ CODING_ID }` )

    expect( screen.getByText( '2 Melete prompts in the list' ) ).toBeInTheDocument()
  } )

  it( 'opens the default profile on /settings/prompts', () => {
    const { location } = renderWithRouter( '/settings/prompts' )

    expect( location().pathname ).toBe( `/settings/prompts/${ BUSINESS_ID }` )
    expect( screen.getByText( `panel for ${ BUSINESS_ID }` ) ).toBeInTheDocument()
  } )

  it( 'shows the list next to the selected prompt', () => {
    renderWithRouter( `/settings/prompts/${ CODING_ID }` )

    expect( screen.getByText( `list, selected ${ CODING_ID }` ) ).toBeInTheDocument()
    expect( screen.getByText( `manager for ${ CODING_ID }` ) ).toBeInTheDocument()
    expect( screen.getByText( `panel for ${ CODING_ID }` ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'link', { name: 'All prompts' } ) ).not.toBeInTheDocument()
  } )

  it( 'selects the linker prompt from the address', () => {
    renderWithRouter( '/settings/prompts/linker' )

    expect( screen.getByText( 'list, selected linker' ) ).toBeInTheDocument()
    expect( screen.getByText( 'panel for linker' ) ).toBeInTheDocument()
  } )

  it( 'stays on the list when the default profile is not in the list', () => {
    vi.mocked( usePromptProfiles ).mockReturnValue( profilesState( { profiles: [] } ) )
    const { location } = renderWithRouter( '/settings/prompts' )

    expect( location().pathname ).toBe( '/settings/prompts' )
    expect( screen.queryByText( /^panel for/ ) ).not.toBeInTheDocument()
  } )
} )

describe( 'PromptsTab, narrow window', () => {
  beforeEach( () => {
    mockMatchMedia( { isWide: false } )
  } )

  it( 'shows only the list on /settings/prompts', () => {
    const { location } = renderWithRouter( '/settings/prompts' )

    expect( location().pathname ).toBe( '/settings/prompts' )
    expect( screen.getByText( 'list, selected none' ) ).toBeInTheDocument()
    expect( screen.queryByText( /^panel for/ ) ).not.toBeInTheDocument()
  } )

  it( 'shows only the editor for a selected prompt, with a way back to the list', async () => {
    const user = userEvent.setup()
    const { location } = renderWithRouter( `/settings/prompts/${ CODING_ID }` )

    expect( screen.getByText( `panel for ${ CODING_ID }` ) ).toBeInTheDocument()
    expect( screen.queryByText( /^list, selected/ ) ).not.toBeInTheDocument()

    await user.click( screen.getByRole( 'link', { name: 'All prompts' } ) )

    expect( location().pathname ).toBe( '/settings/prompts' )
    expect( screen.getByText( 'list, selected none' ) ).toBeInTheDocument()
  } )
} )
