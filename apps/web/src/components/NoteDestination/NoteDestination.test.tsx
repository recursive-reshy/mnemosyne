// Testing Library
import { render, screen } from '@testing-library/react'
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
import { useFolders } from '#src/hooks/useFolders'
import { NoteDestination } from './NoteDestination'

vi.mock( '#src/hooks/useFolders' )

const mockedUseFolders = vi.mocked( useFolders )

const tree = [
  { name: 'Learning', path: 'Learning', children: [] },
  { name: 'Mnemosyne', path: 'Mnemosyne', children: [] },
]

beforeEach( () => {
  mockedUseFolders.mockReset()
  mockedUseFolders.mockReturnValue( { defaultFolder: 'Mnemosyne', folders: tree, error: null } )
} )

describe( 'NoteDestination', () => {
  it( 'shows the folder picker and where the note will go', () => {
    render( <NoteDestination title="A talk" folder={ null } onFolderChange={ vi.fn() } /> )

    expect( screen.getByRole( 'button', { name: 'Change folder' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Mnemosyne/A talk.md' ) ).toBeInTheDocument()
  } )

  it( 'follows the stored folder', () => {
    render( <NoteDestination title="A talk" folder="Learning" onFolderChange={ vi.fn() } /> )

    expect( screen.getByText( 'Learning/A talk.md' ) ).toBeInTheDocument()
  } )

  it( 'reports a chosen folder', async () => {
    const onFolderChange = vi.fn()
    render( <NoteDestination title="A talk" folder={ null } onFolderChange={ onFolderChange } /> )
    const user = userEvent.setup()

    await user.click( screen.getByRole( 'button', { name: 'Change folder' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Learning' } ) )

    expect( onFolderChange ).toHaveBeenCalledExactlyOnceWith( 'Learning' )
  } )

  it( 'says the folders could not be loaded and falls back to the default wording', () => {
    mockedUseFolders.mockReturnValue(
      { defaultFolder: null, folders: [], error: 'Could not reach the server' },
    )
    render( <NoteDestination title="A talk" folder={ null } onFolderChange={ vi.fn() } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.queryByRole( 'button', { name: 'Change folder' } ) ).not.toBeInTheDocument()
    expect( screen.getByText( /in the default folder as/ ) ).toBeInTheDocument()
  } )

  it( 'still shows a stored folder when the folders could not be loaded', () => {
    mockedUseFolders.mockReturnValue( { defaultFolder: null, folders: [], error: 'boom' } )
    render( <NoteDestination title="A talk" folder="Learning" onFolderChange={ vi.fn() } /> )

    expect( screen.getByText( 'Learning/A talk.md' ) ).toBeInTheDocument()
  } )
} )
