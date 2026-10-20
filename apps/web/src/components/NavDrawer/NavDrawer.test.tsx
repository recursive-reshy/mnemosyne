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
import { getGmailAccount } from '#src/api/gmail.api'
import { gmailAccountFixture } from '#src/test-support/gmail.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'

vi.mock( '#src/api/gmail.api' )

const mockedGetAccount = vi.mocked( getGmailAccount )

beforeEach( () => {
  mockedGetAccount.mockReset()
  mockedGetAccount.mockResolvedValue( gmailAccountFixture() )
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

describe( 'NavDrawer, Gmail warning', () => {
  const RECONNECT = 'Settings, Gmail needs reconnecting'

  beforeEach( () => {
    mockedGetAccount.mockResolvedValue(
      gmailAccountFixture( { status: 'reconnect_needed', error: 'revoked' } ),
    )
  } )

  it( 'marks Settings with a warning dot when Gmail needs reconnecting', async () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    const link = await screen.findByRole( 'link', { name: RECONNECT } )

    expect( link ).toHaveAttribute( 'href', '/settings' )
    expect( link.querySelector( '.MuiBadge-dot' ) ).not.toBeNull()
    expect( link ).toHaveTextContent( 'Settings' )
  } )

  it( 'still shows the dot and the name when collapsed to icons', async () => {
    const user = userEvent.setup()
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    const link = await screen.findByRole( 'link', { name: RECONNECT } )

    await user.hover( link )

    expect( link.querySelector( '.MuiBadge-dot' ) ).not.toBeNull()
    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( RECONNECT )
  } )

  it( 'shows it in the narrow drawer too', async () => {
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen /> )

    expect( await screen.findByRole( 'link', { name: RECONNECT } ) ).toBeVisible()
  } )

  it.each( [ 'connected', 'not_connected', 'not_configured' ] as const )(
    'shows no dot when the account is %s',
    async ( status ) => {
      mockedGetAccount.mockResolvedValue( gmailAccountFixture( { status, email: null } ) )
      renderWithClient( <NavDrawer { ...defaults } /> )

      await vi.waitFor( () => expect( mockedGetAccount ).toHaveBeenCalled() )

      const link = screen.getByRole( 'link', { name: 'Settings' } )

      expect( link.querySelector( '.MuiBadge-dot:not(.MuiBadge-invisible)' ) ).toBeNull()
      expect( screen.queryByRole( 'link', { name: RECONNECT } ) ).not.toBeInTheDocument()
    },
  )

  it( 'shows no dot while loading or when the account can not be read', async () => {
    mockedGetAccount.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.queryByRole( 'link', { name: RECONNECT } ) ).not.toBeInTheDocument()
    await vi.waitFor( () => expect( mockedGetAccount ).toHaveBeenCalled() )
    expect( screen.queryByRole( 'link', { name: RECONNECT } ) ).not.toBeInTheDocument()
  } )
} )
