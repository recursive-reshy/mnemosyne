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
import {
  BUSINESS_ID,
  modelsFixture,
  profilesFixture,
} from '#src/test-support/summarizer.fixture'
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

describe( 'SubmitForm, summary options', () => {
  const options = {
    profiles: profilesFixture(),
    models: modelsFixture().models,
    profileId: BUSINESS_ID,
    model: 'claude-sonnet-5-5',
    isLoading: false,
    onProfileChange: vi.fn(),
    onModelChange: vi.fn(),
  }

  it( 'has no profile or model selects without options', () => {
    setup()

    expect( screen.queryByRole( 'combobox', { name: 'Prompt profile' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'combobox', { name: 'Model' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows the profile and model selects between the URL and the button', () => {
    const onSubmit = vi.fn()
    render(
      <SubmitForm
        isSubmitting={ false }
        error={ null }
        onSubmit={ onSubmit }
        options={ options }
      />,
    )

    const url = screen.getByRole( 'textbox', { name: 'Video URL' } )
    const profile = screen.getByRole( 'combobox', { name: 'Prompt profile' } )
    const button = screen.getByRole( 'button', { name: 'Transcribe' } )

    expect( url.compareDocumentPosition( profile ) ).toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( profile.compareDocumentPosition( button ) ).toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( screen.getByRole( 'combobox', { name: 'Model' } ) ).toBeInTheDocument()
  } )

  it( 'still submits just the URL', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <SubmitForm
        isSubmitting={ false }
        error={ null }
        onSubmit={ onSubmit }
        options={ options }
      />,
    )

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( validUrl )
  } )
} )
