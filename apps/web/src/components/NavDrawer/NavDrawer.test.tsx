// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { NavDrawer } from './NavDrawer'
import { ApiError } from '#src/api/apiError'
import { getStatus } from '#src/api/status.api'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  failingRowFixture,
  statusFixture,
  statusRowFixture,
} from '#src/test-support/status.fixture'

vi.mock( '#src/api/status.api' )

const mockedGetStatus = vi.mocked( getStatus )

beforeEach( () => {
  mockedGetStatus.mockReset()
  mockedGetStatus.mockResolvedValue( statusFixture( [ statusRowFixture() ] ) )
} )

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

describe( 'NavDrawer, Settings item', () => {
  it( 'links to the settings page', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: 'Settings' } ) )
      .toHaveAttribute( 'href', '/settings' )
  } )

  it( 'sits above the colour mode control, after the module items', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    const transcriber = screen.getByRole( 'link', { name: 'Transcriber' } )
    const settings = screen.getByRole( 'link', { name: 'Settings' } )
    const colourMode = screen.getByRole( 'group', { name: 'Colour mode' } )

    expect( transcriber.compareDocumentPosition( settings ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( settings.compareDocumentPosition( colourMode ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
  } )

  it( 'is current on /settings, and Transcriber is not', () => {
    renderWithClient( <NavDrawer { ...defaults } />, { route: '/settings' } )

    expect( screen.getByRole( 'link', { name: 'Settings' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
    expect( screen.getByRole( 'link', { name: 'Transcriber' } ) )
      .not.toHaveAttribute( 'aria-current' )
  } )

  it.each( [ '/settings/prompts', '/settings/models', '/settings/sources' ] )(
    'is current on %s',
    ( route ) => {
      renderWithClient( <NavDrawer { ...defaults } />, { route } )

      expect( screen.getByRole( 'link', { name: 'Settings' } ) )
        .toHaveAttribute( 'aria-current', 'page' )
    },
  )

  it( 'is not current elsewhere', () => {
    renderWithClient( <NavDrawer { ...defaults } />, { route: '/' } )

    expect( screen.getByRole( 'link', { name: 'Settings' } ) )
      .not.toHaveAttribute( 'aria-current' )
  } )

  it( 'keeps its name when collapsed, with a tooltip on hover', async () => {
    const user = userEvent.setup()
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    await user.hover( screen.getByRole( 'link', { name: 'Settings' } ) )

    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Settings' )
  } )

  it( 'asks a narrow drawer to close when chosen, and navigates', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { location } = renderWithClient(
      <NavDrawer { ...defaults } isNarrow isOpen onClose={ onClose } />,
    )

    await user.click( screen.getByRole( 'link', { name: 'Settings' } ) )

    expect( onClose ).toHaveBeenCalledTimes( 1 )
    expect( location().pathname ).toBe( '/settings' )
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

describe( 'NavDrawer, failing badge on Settings', () => {
  const failing = ( count: number ) => {
    return statusFixture( Array.from( { length: count }, ( _, index ) => {
      return failingRowFixture( { kind: 'feed', id: `f${ index }`, name: `Feed ${ index }` } )
    } ) )
  }

  const badgeOf = ( link: HTMLElement ): Element | null => {
    return link.querySelector( '.MuiBadge-badge:not(.MuiBadge-invisible)' )
  }

  it( 'shows the number of failing things and says it in the name', async () => {
    mockedGetStatus.mockResolvedValue( failing( 3 ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    const link = await screen.findByRole( 'link', { name: 'Settings, 3 failing' } )

    expect( link ).toHaveAttribute( 'href', '/settings' )
    expect( badgeOf( link ) ).toHaveTextContent( '3' )
    expect( link ).toHaveTextContent( 'Settings' )
  } )

  it( 'counts one failing thing too', async () => {
    mockedGetStatus.mockResolvedValue( failing( 1 ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( await screen.findByRole( 'link', { name: 'Settings, 1 failing' } ) )
      .toBeInTheDocument()
  } )

  it( 'counts the Gmail connection when it needs a reconnect', async () => {
    mockedGetStatus.mockResolvedValue( statusFixture( [
      failingRowFixture( { kind: 'gmail_connection', name: 'Gmail connection' } ),
      statusRowFixture(),
    ] ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( await screen.findByRole( 'link', { name: 'Settings, 1 failing' } ) )
      .toBeInTheDocument()
  } )

  it( 'still shows the number and the name when collapsed to icons', async () => {
    const user = userEvent.setup()

    mockedGetStatus.mockResolvedValue( failing( 2 ) )
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    const link = await screen.findByRole( 'link', { name: 'Settings, 2 failing' } )

    await user.hover( link )

    expect( badgeOf( link ) ).toHaveTextContent( '2' )
    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Settings, 2 failing' )
  } )

  it( 'shows it in the narrow drawer too', async () => {
    mockedGetStatus.mockResolvedValue( failing( 2 ) )
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen /> )

    expect( await screen.findByRole( 'link', { name: 'Settings, 2 failing' } ) ).toBeVisible()
  } )

  it( 'shows no badge and keeps the plain name when nothing is failing', async () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    await vi.waitFor( () => expect( mockedGetStatus ).toHaveBeenCalled() )

    const link = screen.getByRole( 'link', { name: 'Settings' } )

    expect( badgeOf( link ) ).toBeNull()
    expect( screen.queryByRole( 'link', { name: /failing/ } ) ).not.toBeInTheDocument()
  } )

  it( 'shows no badge while loading or when the status can not be read', async () => {
    mockedGetStatus.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.queryByRole( 'link', { name: /failing/ } ) ).not.toBeInTheDocument()
    await vi.waitFor( () => expect( mockedGetStatus ).toHaveBeenCalled() )
    expect( screen.queryByRole( 'link', { name: /failing/ } ) ).not.toBeInTheDocument()
    expect( badgeOf( screen.getByRole( 'link', { name: 'Settings' } ) ) ).toBeNull()
  } )
} )
