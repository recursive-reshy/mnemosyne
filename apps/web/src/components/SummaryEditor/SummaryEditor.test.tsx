// Testing Library
import { fireEvent, render, screen } from '@testing-library/react'
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
    render(
      <SummaryEditor value={ '## Summary\nText' } onChange={ vi.fn() } onCaretLine={ vi.fn() } />,
    )

    expect( screen.getByRole( 'textbox', { name: 'Summary' } ) ).toHaveValue( '## Summary\nText' )
  } )

  it( 'reports edits', async () => {
    const onChange = vi.fn()
    render( <SummaryEditor value="" onChange={ onChange } onCaretLine={ vi.fn() } /> )

    await userEvent.setup().type( screen.getByRole( 'textbox', { name: 'Summary' } ), 'a' )

    expect( onChange ).toHaveBeenCalledWith( 'a' )
  } )

  it( 'reports the line under the caret when the selection moves', () => {
    const onCaretLine = vi.fn()
    const text = '## Summary\n- Point ([00:05])\nEnd'
    render( <SummaryEditor value={ text } onChange={ vi.fn() } onCaretLine={ onCaretLine } /> )
    const editor = screen.getByRole< HTMLTextAreaElement >( 'textbox', { name: 'Summary' } )

    editor.setSelectionRange( 15, 15 )
    fireEvent.select( editor )

    expect( onCaretLine ).toHaveBeenLastCalledWith( '- Point ([00:05])' )

    editor.setSelectionRange( 3, 3 )
    fireEvent.select( editor )

    expect( onCaretLine ).toHaveBeenLastCalledWith( '## Summary' )
  } )
} )
