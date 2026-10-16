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
import { SubmitForm } from './SubmitForm'

const validUrl = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'
const validationMessage = 'Enter a video URL starting with http:// or https://'

const setup = ( props: { isSubmitting?: boolean, error?: string | null } = {} ) => {
  const onSubmit = vi.fn()

  render( <SubmitForm isSubmitting={ false } error={ null } onSubmit={ onSubmit } { ...props } /> )

  return { onSubmit, user: userEvent.setup() }
}

describe( 'SubmitForm', () => {
  it( 'renders a named form, a labelled input and a button', () => {
    setup()

    expect( screen.getByRole( 'form', { name: 'Transcribe a video' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Video URL' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Transcribe' } ) ).toBeInTheDocument()
  } )

  it( 'submits a valid URL', async () => {
    const { onSubmit, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( onSubmit ).toHaveBeenCalledTimes( 1 )
    expect( onSubmit ).toHaveBeenCalledWith( validUrl )
  } )

  it( 'trims surrounding spaces', async () => {
    const { onSubmit, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), `  ${ validUrl }  ` )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( validUrl )
  } )

  it( 'submits on Enter', async () => {
    const { onSubmit, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), `${ validUrl }{Enter}` )

    expect( onSubmit ).toHaveBeenCalledWith( validUrl )
  } )

  it.each( [ '', 'ftp://example.com', 'not a url' ] )(
    'rejects %j with a message',
    async ( value ) => {
      const { onSubmit, user } = setup()
      const input = screen.getByRole( 'textbox', { name: 'Video URL' } )

      if( value ) {
        await user.type( input, value )
      }
      await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( validationMessage )
      expect( input ).toHaveAttribute( 'aria-invalid', 'true' )
      expect( input ).toHaveAccessibleDescription( validationMessage )
      expect( onSubmit ).not.toHaveBeenCalled()
    },
  )

  it( 'clears the validation message when the user types', async () => {
    const { user } = setup()
    const input = screen.getByRole( 'textbox', { name: 'Video URL' } )

    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )
    expect( screen.getByRole( 'alert' ) ).toBeInTheDocument()

    await user.type( input, 'h' )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
    expect( input ).not.toHaveAttribute( 'aria-invalid', 'true' )
  } )

  it( 'disables the form while submitting', async () => {
    const { onSubmit, user } = setup( { isSubmitting: true } )
    const button = screen.getByRole( 'button', { name: 'Starting…' } )

    await user.click( button )

    expect( button ).toBeDisabled()
    expect( screen.getByRole( 'textbox', { name: 'Video URL' } ) ).toBeDisabled()
    expect( onSubmit ).not.toHaveBeenCalled()
  } )

  it( 'shows the error prop in an alert that describes the input', () => {
    setup( { error: 'Could not reach the server' } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.getByRole( 'textbox', { name: 'Video URL' } ) )
      .toHaveAccessibleDescription( 'Could not reach the server' )
  } )

  it( 'does not mark the input invalid for a server error', () => {
    setup( { error: 'Could not reach the server' } )

    expect( screen.getByRole( 'textbox', { name: 'Video URL' } ) )
      .not.toHaveAttribute( 'aria-invalid', 'true' )
  } )
} )
