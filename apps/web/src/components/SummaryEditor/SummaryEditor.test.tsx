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
import { SummaryEditor } from './SummaryEditor'

describe( 'SummaryEditor', () => {
  it( 'is a labelled textarea holding the Markdown', () => {
    render( <SummaryEditor value={ '## Summary\nText' } onChange={ vi.fn() } /> )

    expect( screen.getByRole( 'textbox', { name: 'Summary' } ) ).toHaveValue( '## Summary\nText' )
  } )

  it( 'reports edits', async () => {
    const onChange = vi.fn()
    render( <SummaryEditor value="" onChange={ onChange } /> )

    await userEvent.setup().type( screen.getByRole( 'textbox', { name: 'Summary' } ), 'a' )

    expect( onChange ).toHaveBeenCalledWith( 'a' )
  } )
} )
