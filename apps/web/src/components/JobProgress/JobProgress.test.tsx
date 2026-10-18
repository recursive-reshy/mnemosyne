// Testing Library
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { jobFixture } from '#src/test-support/job.fixture'
import { JobProgress } from './JobProgress'

const labels = [
  'Waiting to start',
  'Downloading audio',
  'Converting audio',
  'Transcribing',
  'Summarizing',
  'Ready for review',
]

const setup = ( job: Job, connectionError: string | null = null ) => {
  const onRetry = vi.fn()

  render( <JobProgress job={ job } connectionError={ connectionError } onRetry={ onRetry } /> )

  return { onRetry, user: userEvent.setup() }
}

describe( 'JobProgress', () => {
  it.each( [
    [ 'queued', 'Waiting in the queue…', 'Waiting to start' ],
    [ 'downloading', 'Downloading audio…', 'Downloading audio' ],
    [ 'converting', 'Converting audio…', 'Converting audio' ],
    [ 'transcribing', 'Transcribing…', 'Transcribing' ],
    [ 'summarizing', 'Summarizing…', 'Summarizing' ],
    [ 'ready_for_review', 'Ready for review', 'Ready for review' ],
  ] as const )( 'shows the %s state', ( status, message, label ) => {
    setup( jobFixture( { status } ) )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( message )

    const current = screen.getAllByRole( 'listitem' )
      .filter( ( item ) => item.getAttribute( 'aria-current' ) === 'step' )

    expect( current ).toHaveLength( 1 )
    expect( current[ 0 ] ).toHaveTextContent( label )
  } )

  it.each( [
    [ 'fetching', 'Fetching the article…' ],
    [ 'summary_failed', 'Summary failed' ],
    [ 'saved', 'Saved' ],
  ] as const )( 'shows a message for the %s state', ( status, message ) => {
    setup( jobFixture( { status } ) )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( message )
  } )

  it( 'lists the six stages in order', () => {
    setup( jobFixture( { status: 'queued' } ) )

    const items = within( screen.getByRole( 'list' ) ).getAllByRole( 'listitem' )

    expect( items.map( ( item ) => item.textContent ) ).toEqual( labels )
  } )

  it( 'marks stages complete, current and pending', () => {
    setup( jobFixture( { status: 'transcribing' } ) )

    const states = screen.getAllByRole( 'listitem' ).map( ( item ) => item.dataset.state )

    expect( states ).toEqual( [
      'complete',
      'complete',
      'complete',
      'current',
      'pending',
      'pending',
    ] )
  } )

  it( 'marks every stage complete when ready, keeping the last as the current step', () => {
    setup( jobFixture( { status: 'ready_for_review' } ) )

    const items = screen.getAllByRole( 'listitem' )

    expect( items.map( ( item ) => item.dataset.state ) ).toEqual( Array( 6 ).fill( 'complete' ) )
    expect( items.at( -1 ) ).toHaveAttribute( 'aria-current', 'step' )
  } )

  it( 'shows the job URL', () => {
    setup( jobFixture() )

    expect( screen.getByText( jobFixture().url ) ).toBeInTheDocument()
  } )

  it( 'shows the error and a retry button for a failed job', async () => {
    const job = jobFixture( { status: 'failed', error: 'Video unavailable' } )
    const { onRetry, user } = setup( job )

    expect( screen.queryByRole( 'list' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Video unavailable' )

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    expect( onRetry ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'falls back to a generic message when a failed job has no error', () => {
    setup( jobFixture( { status: 'failed', error: null } ) )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcription failed.' )
  } )

  it( 'has no retry button while the job is running', () => {
    setup( jobFixture( { status: 'downloading' } ) )

    expect( screen.queryByRole( 'button', { name: 'Try again' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a connection error above the list', () => {
    setup( jobFixture( { status: 'downloading' } ), 'Could not reach the server' )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Could not reach the server. Retrying…' )
    expect( screen.getAllByRole( 'listitem' ) ).toHaveLength( 6 )
  } )

  it( 'shows no alert without a connection error', () => {
    setup( jobFixture( { status: 'downloading' } ) )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )
} )
