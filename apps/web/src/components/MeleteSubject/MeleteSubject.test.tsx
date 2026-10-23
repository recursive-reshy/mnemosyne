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
  useEnrollSubject,
  useRetryGeneration,
  useSetNoteEnrolled,
  useUpdateSubject,
} from '#src/hooks/useMeleteMutations'
import { useMeleteSubject } from '#src/hooks/useMeleteSubject'
import {
  meleteNoteFixture,
  meleteSubjectFixture,
  NOTE_ID,
  SUBJECT_ID,
} from '#src/test-support/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteSubject } from './MeleteSubject'

vi.mock( '#src/hooks/useMeleteSubject' )
vi.mock( '#src/hooks/useMeleteMutations' )

const mocks = {
  subject: vi.mocked( useMeleteSubject ),
  enroll: vi.fn(),
  update: vi.fn(),
  setNote: vi.fn(),
  retry: vi.fn(),
}

const show = ( overrides = {} ): void => {
  mocks.subject.mockReturnValue( {
    subject: meleteSubjectFixture(),
    notes: [ meleteNoteFixture() ],
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

const renderPage = () => {
  renderWithClient( <MeleteSubject />, {
    route: `/melete/subjects/${ SUBJECT_ID }`,
    path: '/melete/subjects/:subjectId',
  } )

  return userEvent.setup()
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  vi.mocked( useEnrollSubject ).mockReturnValue( mutationStub( { mutate: mocks.enroll } ) )
  vi.mocked( useUpdateSubject ).mockReturnValue( mutationStub( { mutate: mocks.update } ) )
  vi.mocked( useSetNoteEnrolled ).mockReturnValue( mutationStub( { mutate: mocks.setNote } ) )
  vi.mocked( useRetryGeneration ).mockReturnValue( mutationStub( { mutate: mocks.retry } ) )
  show()
} )

describe( 'MeleteSubject', () => {
  it( 'loads the subject from the URL and shows its name and counts', () => {
    renderPage()

    expect( mocks.subject ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( screen.getByRole( 'heading', { name: 'TypeScript' } ) ).toBeInTheDocument()
    expect( screen.getByText( '8 notes · 3 enrolled · 4 due' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Today' } ) ).toHaveAttribute( 'href', '/melete' )
  } )

  it( 'enrolls and unenrolls every note', async () => {
    const user = renderPage()

    await user.click( screen.getByRole( 'button', { name: 'Enroll all' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Unenroll all' } ) )

    expect( mocks.enroll ).toHaveBeenNthCalledWith( 1, { id: SUBJECT_ID, enrolled: true } )
    expect( mocks.enroll ).toHaveBeenNthCalledWith( 2, { id: SUBJECT_ID, enrolled: false } )
  } )

  it( 'updates the subject settings', async () => {
    const user = renderPage()

    await user.click( screen.getByRole( 'switch', { name: 'Auto-enroll new notes' } ) )

    expect( mocks.update ).toHaveBeenCalledWith( { id: SUBJECT_ID, body: { auto_enroll: true } } )
  } )

  it( 'enrolls one note and retries a failed one', async () => {
    show( { notes: [ meleteNoteFixture( { enrolled: false, generation: 'failed' } ) ] } )
    const user = renderPage()

    await user.click( screen.getByRole( 'switch', { name: 'Generics' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Retry' } ) )

    expect( mocks.setNote ).toHaveBeenCalledWith( { id: NOTE_ID, enrolled: true } )
    expect( mocks.retry ).toHaveBeenCalledWith( NOTE_ID )
  } )

  it( 'says so when the subject has no notes', () => {
    show( { notes: [] } )
    renderPage()

    expect( screen.getByText( 'No notes in this folder yet.' ) ).toBeInTheDocument()
  } )

  it( 'shows a status while loading', () => {
    show( { subject: null, notes: [], isLoading: true } )
    renderPage()

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows the server\'s message, such as a missing learning root', () => {
    show( { subject: null, notes: [], error: 'Choose a learning root first' } )
    renderPage()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Choose a learning root first' )
  } )

  it( 'shows the message of a failed change', () => {
    vi.mocked( useEnrollSubject ).mockReturnValue(
      mutationStub( { isError: true, error: new Error( 'Subject not found' ) } ),
    )
    renderPage()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Subject not found' )
  } )
} )
