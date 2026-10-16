// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { NavDrawer } from './NavDrawer'
import { renderWithClient } from '#src/test-support/renderWithClient'

const defaults = {
  id: 'nav',
  isNarrow: false,
  isExpanded: true,
  isOpen: false,
  onClose: vi.fn(),
}

describe( 'NavDrawer, wide', () => {
  it( 'lists Transcriber as a link to the home page', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: 'Transcriber' } ) ).toHaveAttribute( 'href', '/' )
  } )

  it.each( [ '/', '/jobs/3f2b8c1e' ] )( 'marks Transcriber as current on %s', ( route ) => {
    renderWithClient( <NavDrawer { ...defaults } />, { route } )

    expect( screen.getByRole( 'link', { name: 'Transcriber' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
  } )

  it( 'keeps the item name when collapsed to icons', () => {
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    expect( screen.getByRole( 'link', { name: 'Transcriber' } ) ).toBeInTheDocument()
  } )

  it( 'shows a tooltip with the name on hover when collapsed', async () => {
    const user = userEvent.setup()
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    await user.hover( screen.getByRole( 'link', { name: 'Transcriber' } ) )

    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Transcriber' )
  } )

  it( 'has the colour mode control, as a group when expanded', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'group', { name: 'Colour mode' } ) ).toBeInTheDocument()
  } )

  it( 'has the colour mode control, as one button when collapsed', () => {
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    expect( screen.getByRole( 'button', { name: 'Colour mode' } ) ).toBeInTheDocument()
  } )
} )

describe( 'NavDrawer, narrow', () => {
  it( 'shows nothing while closed', () => {
    renderWithClient( <NavDrawer { ...defaults } isNarrow /> )

    expect( screen.queryByRole( 'link', { name: 'Transcriber' } ) ).not.toBeInTheDocument()
  } )

  it( 'lists the items with labels when open, even if the wide drawer is collapsed', () => {
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen isExpanded={ false } /> )

    expect( screen.getByRole( 'link', { name: 'Transcriber' } ) ).toBeVisible()
    expect( screen.getByRole( 'group', { name: 'Colour mode' } ) ).toBeInTheDocument()
  } )

  it( 'asks to close when an item is chosen', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen onClose={ onClose } /> )

    await user.click( screen.getByRole( 'link', { name: 'Transcriber' } ) )

    expect( onClose ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'asks to close on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen onClose={ onClose } /> )

    await user.keyboard( '{Escape}' )

    expect( onClose ).toHaveBeenCalled()
  } )
} )
