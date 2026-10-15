// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { FilenamePreview } from './FilenamePreview'

describe( 'FilenamePreview', () => {
  it( 'shows the vault path the note will get', () => {
    render( <FilenamePreview title="How Rust Works" /> )

    expect( screen.getByText( 'Mnemosyne/How Rust Works.md' ) ).toBeInTheDocument()
  } )

  it( 'removes characters that are not allowed in a file name', () => {
    render( <FilenamePreview title={ 'What Is RAG: A Primer #1' } /> )

    expect( screen.getByText( 'Mnemosyne/What Is RAG A Primer 1.md' ) ).toBeInTheDocument()
  } )

  it( 'falls back to Untitled for a blank title', () => {
    render( <FilenamePreview title="   " /> )

    expect( screen.getByText( 'Mnemosyne/Untitled.md' ) ).toBeInTheDocument()
  } )

  it( 'updates when the title changes', () => {
    const { rerender } = render( <FilenamePreview title="One" /> )

    rerender( <FilenamePreview title="Two" /> )

    expect( screen.getByText( 'Mnemosyne/Two.md' ) ).toBeInTheDocument()
  } )
} )
