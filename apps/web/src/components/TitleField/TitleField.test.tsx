// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { TitleField } from './TitleField'

describe( 'TitleField', () => {
  it( 'is a labelled input holding the value', () => {
    render( <TitleField value="How Rust Works" onChange={ vi.fn() } /> )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'How Rust Works' )
  } )

  it( 'reports each change', async () => {
    const onChange = vi.fn()
    render( <TitleField value="" onChange={ onChange } /> )

    await userEvent.setup().type( screen.getByRole( 'textbox', { name: 'Title' } ), 'Hi' )

    expect( onChange ).toHaveBeenNthCalledWith( 1, 'H' )
    expect( onChange ).toHaveBeenNthCalledWith( 2, 'i' )
  } )
} )
