// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
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
    render( <TranscriptPane transcript={ null } error={ null } focusSecond={ null } /> )

    expect( screen.getByRole( 'region', { name: 'Transcript' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading transcript…' )
  } )

  it( 'shows the error', () => {
    render(
      <TranscriptPane transcript={ null } error="Transcript not ready" focusSecond={ null } />,
    )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcript not ready' )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'shows paragraphs with a clock stamp each', () => {
    render( <TranscriptPane transcript={ transcript } error={ null } focusSecond={ null } /> )

    const pane = screen.getByRole( 'region', { name: 'Transcript' } )

    expect( pane ).toHaveTextContent( '[00:00] Welcome to the talk. Today we cover ownership.' )
    expect( pane ).toHaveTextContent( '[02:15] Last, borrowing.' )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'gives each paragraph an id by its start second', () => {
    const { container } = render(
      <TranscriptPane transcript={ transcript } error={ null } focusSecond={ null } />,
    )

    expect( container.querySelector( '#transcript-0' ) ).not.toBeNull()
    expect( container.querySelector( '#transcript-135' ) ).not.toBeNull()
  } )

  describe( 'following the summary caret', () => {
    afterEach( () => {
      vi.restoreAllMocks()
    } )

    const stubOffsets = (): void => {
      vi.spyOn( HTMLElement.prototype, 'offsetTop', 'get' ).mockImplementation( function get(
        this: HTMLElement,
      ) {
        const tops: Record< string, number > = { 'transcript-0': 0, 'transcript-135': 500 }

        return tops[ this.id ] ?? 0
      } )
    }

    it( 'marks and scrolls to the paragraph at or before the second', () => {
      stubOffsets()
      const { rerender } = render(
        <TranscriptPane transcript={ transcript } error={ null } focusSecond={ null } />,
      )
      const pane = screen.getByRole( 'region', { name: 'Transcript' } )

      rerender( <TranscriptPane transcript={ transcript } error={ null } focusSecond={ 140 } /> )

      expect( pane.scrollTop ).toBe( 500 )
      expect( document.getElementById( 'transcript-135' ) )
        .toHaveAttribute( 'aria-current', 'true' )
      expect( document.getElementById( 'transcript-0' ) ).not.toHaveAttribute( 'aria-current' )
    } )

    it( 'picks the earlier paragraph for a second inside it', () => {
      stubOffsets()
      render( <TranscriptPane transcript={ transcript } error={ null } focusSecond={ 100 } /> )

      expect( document.getElementById( 'transcript-0' ) ).toHaveAttribute( 'aria-current', 'true' )
      expect( screen.getByRole( 'region', { name: 'Transcript' } ).scrollTop ).toBe( 0 )
    } )

    it( 'marks a paragraph that starts a fraction after the whole second cited', () => {
      stubOffsets()
      const fractional: Transcript = {
        ...transcript,
        segments: [
          { start: 0.4, end: 4, text: 'Welcome to the talk.' },
          { start: 135.4, end: 140, text: 'Last, borrowing.' },
        ],
      }

      render( <TranscriptPane transcript={ fractional } error={ null } focusSecond={ 135 } /> )

      expect( document.getElementById( 'transcript-135' ) )
        .toHaveAttribute( 'aria-current', 'true' )
      expect( document.getElementById( 'transcript-0' ) ).not.toHaveAttribute( 'aria-current' )
    } )

    it( 'does nothing without a second', () => {
      stubOffsets()
      render( <TranscriptPane transcript={ transcript } error={ null } focusSecond={ null } /> )

      expect( document.querySelector( '[aria-current]' ) ).toBeNull()
    } )
  } )
} )
