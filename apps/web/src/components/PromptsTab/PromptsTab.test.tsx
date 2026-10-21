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
import { settingsState } from '#src/test-support/hookStates'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { settingsFixture } from '#src/test-support/summarizer.fixture'
import { PromptsTab } from './PromptsTab'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '../PromptProfiles', () => ( { PromptProfiles: () => <p>profiles</p> } ) )
vi.mock( '../LinkerPrompt', () => ( { LinkerPrompt: () => <p>linker prompt</p> } ) )
vi.mock( '../LockedInstructions', () => ( {
  LockedInstructions: ( { title, text }: { title?: string, text: string } ) => (
    <p>{ `${ title ?? 'locked' }: ${ text }` }</p>
  ),
} ) )

beforeEach( () => {
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
} )

// A stopgap until the list and editor layout replaces it (task 4.4); it keeps every prompt
// control reachable meanwhile.
describe( 'PromptsTab', () => {
  it( 'has the profiles, the linker prompt and the locked instructions', () => {
    renderWithClient( <PromptsTab /> )
    const locked = settingsFixture().locked_instructions
    const sends = 'Instructions the app always sends'

    expect( screen.getByText( 'profiles' ) ).toBeInTheDocument()
    expect( screen.getByText( 'linker prompt' ) ).toBeInTheDocument()
    expect( screen.getByText( `${ sends } for videos: ${ locked.video }` ) ).toBeInTheDocument()
    expect( screen.getByText( `${ sends } for articles: ${ locked.article }` ) )
      .toBeInTheDocument()
    expect( screen.getByText(
      'Instructions the app always sends when linking: You propose links.',
    ) ).toBeInTheDocument()
  } )

  it( 'says the linker\'s locked instructions are unavailable while the agent is down', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      agentStatus: 'unavailable',
      linkerLockedInstructions: null,
    } ) )
    renderWithClient( <PromptsTab /> )

    expect( screen.getByText( 'Unavailable while the agent service is down.' ) )
      .toBeInTheDocument()
  } )
} )
