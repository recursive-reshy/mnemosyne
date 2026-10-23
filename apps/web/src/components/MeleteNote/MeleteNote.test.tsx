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
import {
  useDropQuestion,
  useRegenerateNote,
  useRetryGeneration,
} from '#src/hooks/useMeleteMutations'
import { useMeleteNote } from '#src/hooks/useMeleteNote'
import {
  meleteNoteFixture,
  meleteQuestionFixture,
  NOTE_ID,
  QUESTION_ID,
  SUBJECT_ID,
} from '#src/test-support/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteNote } from './MeleteNote'

vi.mock( '#src/hooks/useMeleteNote' )
vi.mock( '#src/hooks/useMeleteMutations' )

const mocks = {
  note: vi.mocked( useMeleteNote ),
  regenerate: vi.fn(),
  retry: vi.fn(),
  drop: vi.fn(),
}

const OBSIDIAN_URL = 'obsidian://open?vault=Brain&file=Learning%2FTypeScript%2FGenerics'

const show = ( overrides = {} ): void => {
  mocks.note.mockReturnValue( {
    note: meleteNoteFixture(),
    questions: [ meleteQuestionFixture() ],
    obsidianUrl: OBSIDIAN_URL,
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

const renderPage = () => {
  renderWithClient( <MeleteNote />, {
    route: `/melete/notes/${ NOTE_ID }`,
    path: '/melete/notes/:noteId',
  } )

  return userEvent.setup()
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  vi.mocked( useRegenerateNote ).mockReturnValue( mutationStub( { mutate: mocks.regenerate } ) )
  vi.mocked( useRetryGeneration ).mockReturnValue( mutationStub( { mutate: mocks.retry } ) )
  vi.mocked( useDropQuestion ).mockReturnValue( mutationStub( { mutate: mocks.drop } ) )
  show()
} )

describe( 'MeleteNote', () => {
  it( 'loads the note from the URL and shows its title, path and a link back', () => {
    renderPage()

    expect( mocks.note ).toHaveBeenCalledWith( NOTE_ID )
    expect( screen.getByRole( 'heading', { name: 'Generics' } ) ).toBeInTheDocument()
    expect( screen.getByText( 'Learning/TypeScript/Generics.md' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Subject' } ) )
      .toHaveAttribute( 'href', `/melete/subjects/${ SUBJECT_ID }` )
  } )

  it( 'opens the note in Obsidian when the link is known', () => {
    renderPage()

    expect( screen.getByRole( 'link', { name: 'Open in Obsidian' } ) )
      .toHaveAttribute( 'href', OBSIDIAN_URL )
  } )

  it( 'leaves the Obsidian link out when it is not known', () => {
    show( { obsidianUrl: null } )
    renderPage()

    expect( screen.queryByRole( 'link', { name: 'Open in Obsidian' } ) ).not.toBeInTheDocument()
  } )

  it( 'regenerates the questions', async () => {
    const user = renderPage()

    await user.click( screen.getByRole( 'button', { name: 'Regenerate' } ) )

    expect( mocks.regenerate ).toHaveBeenCalledWith( NOTE_ID )
  } )

  it.each( [ 'queued', 'generating' ] as const )(
    'cannot regenerate while %s, and says so',
    ( generation ) => {
      show( { note: meleteNoteFixture( { generation } ) } )
      renderPage()

      expect( screen.getByRole( 'button', { name: 'Regenerate' } ) ).toBeDisabled()
      expect( screen.getByText( 'Generating…' ) ).toBeInTheDocument()
    },
  )

  it( 'lists active questions and drops one', async () => {
    const user = renderPage()

    expect( screen.getByText( 'What does a type parameter do?' ) ).toBeInTheDocument()
    await user.click( screen.getByRole( 'button', { name: 'Drop' } ) )

    expect( mocks.drop ).toHaveBeenCalledWith( QUESTION_ID )
  } )

  it( 'lists dropped questions under a Dropped heading', () => {
    show( {
      questions: [
        meleteQuestionFixture( { prompt: 'Active one' } ),
        meleteQuestionFixture( {
          id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          prompt: 'Dropped one',
          state: 'dropped',
        } ),
      ],
    } )
    renderPage()

    const heading = screen.getByRole( 'heading', { name: 'Dropped' } )
    const dropped = screen.getByText( 'Dropped one' )

    expect( heading.compareDocumentPosition( dropped ) ).toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( screen.getByText( 'Active one' ).compareDocumentPosition( heading ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( screen.getAllByRole( 'button', { name: 'Drop' } ) ).toHaveLength( 1 )
  } )

  it( 'has no Dropped heading when nothing was dropped', () => {
    renderPage()

    expect( screen.queryByRole( 'heading', { name: 'Dropped' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a failed generation with its error and retries it', async () => {
    show( {
      note: meleteNoteFixture( { generation: 'failed', generation_error: 'The note is too long' } ),
      questions: [],
    } )
    const user = renderPage()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'The note is too long' )
    await user.click( screen.getByRole( 'button', { name: 'Retry' } ) )

    expect( mocks.retry ).toHaveBeenCalledWith( NOTE_ID )
  } )

  it( 'labels a note that is missing from the vault', () => {
    show( { note: meleteNoteFixture( { missing: true } ) } )
    renderPage()

    expect( screen.getByText( 'Missing from the vault' ) ).toBeInTheDocument()
  } )

  it( 'labels a changed note that is regenerating', () => {
    show( { note: meleteNoteFixture( { generation: 'queued', stale: true } ) } )
    renderPage()

    expect( screen.getByText( 'Changed — regenerating' ) ).toBeInTheDocument()
  } )

  it( 'says so when there are no questions yet', () => {
    show( { questions: [] } )
    renderPage()

    expect( screen.getByText( 'No questions yet.' ) ).toBeInTheDocument()
  } )

  it( 'shows a status while loading and the error when it fails', () => {
    show( { note: null, questions: [], isLoading: true } )
    renderPage()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows the error of a failed load', () => {
    show( { note: null, questions: [], error: 'Note not found' } )
    renderPage()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Note not found' )
  } )
} )
