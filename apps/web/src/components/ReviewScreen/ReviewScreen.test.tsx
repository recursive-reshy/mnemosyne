// Shared
import { parseNote, serializeNote } from '@mnemosyne/shared'
// Testing Library
import { fireEvent, screen, within } from '@testing-library/react'
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
import { ApiError } from '#src/api/apiError'
import {
  discardJob,
  retrySummary,
  saveJob,
  updateDraft,
} from '#src/api/jobs.api'
import { useTranscript } from '#src/hooks/useTranscript'
import { jobFixture } from '#src/test-support/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ReviewScreen } from './ReviewScreen'

vi.mock( '#src/hooks/useTranscript' )
vi.mock( '#src/api/jobs.api' )

const mockedSaveJob = vi.mocked( saveJob )
const mockedUpdateDraft = vi.mocked( updateDraft )
const mockedDiscardJob = vi.mocked( discardJob )
const mockedRetrySummary = vi.mocked( retrySummary )

const mockedUseTranscript = vi.mocked( useTranscript )

const transcript = {
  meta: {
    title: 'How Rust Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 300,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [ { start: 0, end: 4, text: 'Welcome to the talk.' } ],
}

beforeEach( () => {
  window.localStorage.clear()
  mockedUseTranscript.mockReset()
  mockedUseTranscript.mockReturnValue( { transcript, error: null } )
  mockedSaveJob.mockReset()
  mockedUpdateDraft.mockReset()
  mockedDiscardJob.mockReset()
  mockedRetrySummary.mockReset()
} )

const reviewJob = jobFixture( {
  status: 'ready_for_review',
  title: 'How Rust Works',
  summary_markdown: '## Summary\nText.',
  suggested_tags: [ 'rust' ],
  note_markdown: serializeNote( {
    properties: {
      title: 'How Rust Works',
      source: 'https://www.youtube.com/watch?v=abc',
      channel: 'Channel',
      duration: '05:00',
      created: '2026-10-15',
      tags: [ 'mnemosyne', 'rust' ],
    },
    body: '## Summary\nText.\n',
  } ),
} )

const handlers = () => ( { onSaved: vi.fn(), onDiscarded: vi.fn() } )

const failedJob = { ...reviewJob, status: 'summary_failed' as const, error: 'x' }

describe( 'ReviewScreen title', () => {
  it( 'starts with the job title and shows the file name it will get', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'How Rust Works' )
    expect( screen.getByText( 'Mnemosyne/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'updates the file name as the title is edited', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()
    const field = screen.getByRole( 'textbox', { name: 'Title' } )

    await user.clear( field )
    await user.type( field, 'New: Name' )

    expect( screen.getByText( 'Mnemosyne/New Name.md' ) ).toBeInTheDocument()
  } )

  it( 'has no title field when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'textbox', { name: 'Title' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen tags', () => {
  it( 'starts with mnemosyne and the suggested tags and lets the user edit them', async () => {
    const taggedJob = { ...reviewJob, suggested_tags: [ 'rust', 'go' ] }
    renderWithClient( <ReviewScreen job={ taggedJob } { ...handlers() } /> )
    const user = userEvent.setup()

    const names = (): string[] => {
      return within( screen.getByRole( 'list', { name: 'Tags' } ) )
        .getAllByRole( 'listitem' )
        .map( ( item ) => ( item.textContent ?? '' ).replace( '×', '' ) )
    }

    expect( names().join( ',' ) ).toBe( 'mnemosyne,rust,go' )

    await user.click( screen.getByRole( 'button', { name: 'Remove tag rust' } ) )
    await user.type( screen.getByRole( 'textbox', { name: 'Add tag' } ), 'ai{Enter}' )

    expect( names().join( ',' ) ).toBe( 'mnemosyne,go,ai' )
  } )
} )

describe( 'ReviewScreen summary and transcript', () => {
  it( 'edits the summary Markdown', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()
    const editor = screen.getByRole( 'textbox', { name: 'Summary' } )

    expect( editor ).toHaveValue( '## Summary\nText.' )

    await user.type( editor, ' More.' )

    expect( editor ).toHaveValue( '## Summary\nText. More.' )
  } )

  it( 'shows the transcript next to the summary', () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( mockedUseTranscript ).toHaveBeenCalledWith( reviewJob.id )
    expect( screen.getByRole( 'region', { name: 'Transcript' } ) )
      .toHaveTextContent( '[00:00] Welcome to the talk.' )
  } )

  it( 'keeps the transcript, without the editor, when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'textbox', { name: 'Summary' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'region', { name: 'Transcript' } ) )
      .toHaveTextContent( '[00:00] Welcome to the talk.' )
  } )
} )

describe( 'ReviewScreen drafts', () => {
  const key = `mnemosyne:draft:${ reviewJob.id }`

  it( 'stores edits in the draft', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )

    const stored = JSON.parse( window.localStorage.getItem( key ) ?? 'null' ) as { body: string }
    expect( stored.body ).toBe( '## Summary\nText.!' )
  } )

  it( 'restores a stored draft over the server values', () => {
    window.localStorage.setItem(
      key,
      JSON.stringify( { title: 'My title', tags: [ 'go' ], body: 'My summary' } ),
    )

    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'My title' )
    expect( screen.getByRole( 'textbox', { name: 'Summary' } ) ).toHaveValue( 'My summary' )
    expect( screen.getByRole( 'button', { name: 'Remove tag go' } ) ).toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen save', () => {
  const key = `mnemosyne:draft:${ reviewJob.id }`
  const saveButton = (): HTMLElement => screen.getByRole( 'button', { name: /^Save/ } )

  it( 'sends the edited title, tags and summary and reports the saved path', async () => {
    mockedSaveJob.mockResolvedValue( 'Mnemosyne/My Title.md' )
    const onSaved = vi.fn()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } onSaved={ onSaved } /> )
    const user = userEvent.setup()

    const title = screen.getByRole( 'textbox', { name: 'Title' } )
    await user.clear( title )
    await user.type( title, 'My Title' )
    await user.type( screen.getByRole( 'textbox', { name: 'Add tag' } ), 'go{Enter}' )
    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), ' Added.' )
    await user.click( saveButton() )

    expect( mockedSaveJob ).toHaveBeenCalledExactlyOnceWith( reviewJob.id )
    expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      reviewJob.id,
      { note_markdown: expect.any( String ) as string },
    )

    const sent = mockedUpdateDraft.mock.calls[ 0 ]?.[ 1 ].note_markdown ?? ''
    const note = parseNote( sent )
    expect( note.properties.title ).toBe( 'My Title' )
    expect( note.properties.tags ).toEqual( [ 'mnemosyne', 'rust', 'go' ] )
    expect( note.properties.source ).toBe( 'https://www.youtube.com/watch?v=abc' )
    expect( note.body ).toBe( '## Summary\nText. Added.\n' )
    await vi.waitFor( () => expect( onSaved ).toHaveBeenCalledWith( 'Mnemosyne/My Title.md' ) )
  } )

  it( 'waits for the server: the button is busy and disabled meanwhile', async () => {
    let resolve: ( path: string ) => void = () => undefined
    mockedSaveJob.mockReturnValue( new Promise< string >( ( resolver ) => {
      resolve = resolver
    } ) )
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )
    const user = userEvent.setup()

    await user.click( saveButton() )

    expect( screen.getByRole( 'button', { name: 'Saving…' } ) ).toBeDisabled()

    resolve( 'Mnemosyne/How Rust Works.md' )
    await vi.waitFor( () => expect( screen.getByRole( 'button', { name: 'Save to vault' } ) ) )
  } )

  it( 'clears the draft and refreshes the job list after saving', async () => {
    mockedSaveJob.mockResolvedValue( 'Mnemosyne/How Rust Works.md' )
    const { queryClient } = renderWithClient(
      <ReviewScreen job={ reviewJob } { ...handlers() } />,
    )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )
    const user = userEvent.setup()
    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )
    expect( window.localStorage.getItem( key ) ).not.toBeNull()

    await user.click( saveButton() )

    await vi.waitFor( () => expect( window.localStorage.getItem( key ) ).toBeNull() )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: [ 'jobs' ] } )
  } )

  it( 'shows the server message on failure and keeps the draft', async () => {
    mockedSaveJob.mockRejectedValue( new ApiError( 'Cannot move job from saved to saved', 409 ) )
    const onSaved = vi.fn()
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } onSaved={ onSaved } /> )
    const user = userEvent.setup()
    await user.type( screen.getByRole( 'textbox', { name: 'Summary' } ), '!' )

    await user.click( saveButton() )

    expect( await screen.findByRole( 'alert' ) )
      .toHaveTextContent( 'Cannot move job from saved to saved' )
    expect( onSaved ).not.toHaveBeenCalled()
    expect( window.localStorage.getItem( key ) ).not.toBeNull()
    expect( saveButton() ).toBeEnabled()
  } )

  it( 'disables Save while the title is blank', async () => {
    renderWithClient( <ReviewScreen job={ reviewJob } { ...handlers() } /> )

    await userEvent.setup().clear( screen.getByRole( 'textbox', { name: 'Title' } ) )

    expect( saveButton() ).toBeDisabled()
  } )

  it( 'has no Save button when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'button', { name: /^Save/ } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen discard', () => {
  const discardButton = (): HTMLElement => screen.getByRole( 'button', { name: 'Discard' } )

  it( 'discards the job and reports it', async () => {
    mockedDiscardJob.mockResolvedValue( undefined )
    const onDiscarded = vi.fn()
    renderWithClient(
      <ReviewScreen job={ reviewJob } onSaved={ vi.fn() } onDiscarded={ onDiscarded } />,
    )

    await userEvent.setup().click( discardButton() )

    expect( mockedDiscardJob ).toHaveBeenCalledExactlyOnceWith( reviewJob.id )
    await vi.waitFor( () => expect( onDiscarded ).toHaveBeenCalledTimes( 1 ) )
  } )

  it( 'shows the server message when the discard fails and stays', async () => {
    mockedDiscardJob.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const onDiscarded = vi.fn()
    renderWithClient(
      <ReviewScreen job={ reviewJob } onSaved={ vi.fn() } onDiscarded={ onDiscarded } />,
    )

    await userEvent.setup().click( discardButton() )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( onDiscarded ).not.toHaveBeenCalled()
  } )

  it( 'is available when the summary failed too', () => {
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    expect( discardButton() ).toBeInTheDocument()
  } )
} )

describe( 'ReviewScreen retry', () => {
  it( 'is only offered when the summary failed', () => {
    renderWithClient(
      <ReviewScreen job={ reviewJob } { ...handlers() } />,
    )

    expect( screen.queryByRole( 'button', { name: 'Retry summary' } ) ).not.toBeInTheDocument()
  } )

  it( 'retries the summary of a failed job', async () => {
    mockedRetrySummary.mockResolvedValue( { ...failedJob, status: 'summarizing', error: null } )
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Retry summary' } ) )

    expect( mockedRetrySummary ).toHaveBeenCalledExactlyOnceWith( failedJob.id )
  } )

  it( 'shows the message when the retry fails', async () => {
    mockedRetrySummary.mockRejectedValue( new ApiError( 'Cannot move job from queued', 409 ) )
    renderWithClient(
      <ReviewScreen job={ failedJob } { ...handlers() } />,
    )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'Retry summary' } ) )

    const alerts = await screen.findAllByRole( 'alert' )

    const messages = alerts.map( ( alert ) => alert.textContent )

    expect( messages ).toContain( 'Cannot move job from queued' )
  } )
} )

describe( 'ReviewScreen caret sync', () => {
  const syncedJob = {
    ...reviewJob,
    summary_markdown: '## Summary\n- Point ([02:15](https://youtu.be/abc?t=135))\nPlain line',
  }
  const pointLine = '## Summary\n- Poi'.length

  const moveCaret = ( index: number ): void => {
    const editor = screen.getByRole< HTMLTextAreaElement >( 'textbox', { name: 'Summary' } )

    editor.setSelectionRange( index, index )
    fireEvent.select( editor )
  }

  it( 'marks the transcript paragraph for the timestamp on the caret line', () => {
    mockedUseTranscript.mockReturnValue( {
      transcript: {
        ...transcript,
        segments: [
          { start: 0, end: 4, text: 'Welcome to the talk.' },
          { start: 135, end: 140, text: 'Last, borrowing.' },
        ],
      },
      error: null,
    } )
    renderWithClient( <ReviewScreen job={ syncedJob } { ...handlers() } /> )

    moveCaret( pointLine )

    expect( document.getElementById( 'transcript-135' ) ).toHaveAttribute( 'aria-current', 'true' )
  } )

  it( 'keeps the marker when the caret moves to a line without a timestamp', () => {
    mockedUseTranscript.mockReturnValue( {
      transcript: {
        ...transcript,
        segments: [ { start: 135, end: 140, text: 'Last, borrowing.' } ],
      },
      error: null,
    } )
    renderWithClient( <ReviewScreen job={ syncedJob } { ...handlers() } /> )
    moveCaret( pointLine )

    moveCaret( syncedJob.summary_markdown.length )

    expect( document.getElementById( 'transcript-135' ) ).toHaveAttribute( 'aria-current', 'true' )
  } )
} )
