// Testing Library
import { screen, within } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { noteFixtures } from '#src/test-support/noteFixtures'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { NoteEditor } from './NoteEditor'

const note = noteFixtures[ '0.2.0 summary with YouTube timestamp links' ] ?? ''

const open = async (): Promise< void > => {
  renderWithClient( <NoteEditor value={ note } onChange={ vi.fn() } /> )
  await screen.findByRole( 'heading', { name: 'Key points' } )
}

describe( 'NoteEditor mode toggle', () => {
  it( 'is one named group with the two modes, rich text pressed', async () => {
    await open()

    const group = screen.getByRole( 'group', { name: 'Editor mode' } )
    const buttons = within( group ).getAllByRole( 'button' )

    expect( buttons.map( ( button ) => button.textContent ) )
      .toEqual( [ 'Rich text', 'Source mode' ] )
    expect( buttons[ 0 ] ).toHaveAttribute( 'aria-pressed', 'true' )
    expect( buttons[ 1 ] ).toHaveAttribute( 'aria-pressed', 'false' )
  } )
} )
