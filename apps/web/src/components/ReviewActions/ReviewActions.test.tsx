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
import { ReviewActions } from './ReviewActions'

const setup = ( overrides: Partial< Parameters< typeof ReviewActions >[ 0 ] > = {} ) => {
  const handlers = { onSave: vi.fn(), onRetry: vi.fn(), onDiscard: vi.fn() }

  render(
    <ReviewActions
      hasFailed={ false }
      canSave
      isSaving={ false }
      isRetrying={ false }
      isDiscarding={ false }
      { ...handlers }
      { ...overrides }
    />,
  )

  return { ...handlers, user: userEvent.setup() }
}

describe( 'ReviewActions', () => {
  it( 'offers Save to vault and Discard for a note in review', async () => {
    const { onSave, onDiscard, user } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Save to vault' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Discard' } ) )

    expect( onSave ).toHaveBeenCalledTimes( 1 )
    expect( onDiscard ).toHaveBeenCalledTimes( 1 )
    expect( screen.queryByRole( 'button', { name: 'Retry summary' } ) ).not.toBeInTheDocument()
  } )

  it( 'disables Save when the note cannot be saved yet', () => {
    setup( { canSave: false } )

    expect( screen.getByRole( 'button', { name: 'Save to vault' } ) ).toBeDisabled()
  } )

  it( 'shows Saving… and disables Save while saving', () => {
    setup( { isSaving: true } )

    expect( screen.getByRole( 'button', { name: 'Saving…' } ) ).toBeDisabled()
  } )

  it( 'offers Retry summary instead of Save after a failed summary', async () => {
    const { onRetry, user } = setup( { hasFailed: true } )

    await user.click( screen.getByRole( 'button', { name: 'Retry summary' } ) )

    expect( onRetry ).toHaveBeenCalledTimes( 1 )
    expect( screen.queryByRole( 'button', { name: 'Save to vault' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows Retrying… and disables the button while retrying', () => {
    setup( { hasFailed: true, isRetrying: true } )

    expect( screen.getByRole( 'button', { name: 'Retrying…' } ) ).toBeDisabled()
  } )

  it( 'disables Discard while discarding', () => {
    setup( { isDiscarding: true } )

    expect( screen.getByRole( 'button', { name: 'Discard' } ) ).toBeDisabled()
  } )
} )
