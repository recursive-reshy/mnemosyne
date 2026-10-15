// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// Shared
import type { Transcript } from '@mnemosyne/shared'
// App
import { TranscriptPane } from './TranscriptPane'

const transcript: Transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 300,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [
    { start: 0, end: 4, text: 'Welcome to the talk.' },
    { start: 4, end: 9, text: 'Today we cover ownership.' },
    { start: 135, end: 140, text: 'Last, borrowing.' },
  ],
}

describe( 'TranscriptPane', () => {
  it( 'shows a loading status before the transcript arrives', () => {
    render( <TranscriptPane transcript={ null } error={ null } /> )

    expect( screen.getByRole( 'region', { name: 'Transcript' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading transcript…' )
  } )

  it( 'shows the error', () => {
    render( <TranscriptPane transcript={ null } error="Transcript not ready" /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcript not ready' )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'shows paragraphs with a clock stamp each', () => {
    render( <TranscriptPane transcript={ transcript } error={ null } /> )

    const pane = screen.getByRole( 'region', { name: 'Transcript' } )

    expect( pane ).toHaveTextContent( '[00:00] Welcome to the talk. Today we cover ownership.' )
    expect( pane ).toHaveTextContent( '[02:15] Last, borrowing.' )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'gives each paragraph an id by its start second', () => {
    const { container } = render( <TranscriptPane transcript={ transcript } error={ null } /> )

    expect( container.querySelector( '#transcript-0' ) ).not.toBeNull()
    expect( container.querySelector( '#transcript-135' ) ).not.toBeNull()
  } )
} )
