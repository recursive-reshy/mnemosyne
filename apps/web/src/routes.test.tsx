// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { memberFixture } from '#src/test-support/me.fixture'
import { renderWithRouter } from '#src/test-support/renderWithRouter'

vi.mock( '#src/components/MeleteToday', () => ( { MeleteToday: () => <p>melete today</p> } ) )
vi.mock( '#src/components/HomePage', () => ( { HomePage: () => <p>home page</p> } ) )
vi.mock( '#src/components/AppShell', () => ( {
  AppShell: ( { children }: { children: unknown } ) => <>{ children as never }</>,
} ) )

describe( 'routes and the gate', () => {
  it( 'shows sign-in instead of the page to a signed-out visitor', () => {
    renderWithRouter( '/', { me: null } )

    expect( screen.getByRole( 'button', { name: 'Sign in with Google' } ) ).toBeInTheDocument()
    expect( screen.queryByText( 'home page' ) ).not.toBeInTheDocument()
  } )

  it( 'serves /signin without the app, with its error', () => {
    renderWithRouter( '/signin?error=not_allowed', { me: null } )

    expect( screen.getByRole( 'alert' ).textContent ).toContain( 'not allowed' )
  } )

  it( 'sends a signed-in user from /signin to the app', () => {
    const { location } = renderWithRouter( '/signin' )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByText( 'home page' ) ).toBeInTheDocument()
  } )

  it( 'sends a Melete-only member who opens an unknown path to Melete', () => {
    const me = memberFixture( { modules: [ 'melete' ] } )
    const { location } = renderWithRouter( '/nowhere', { me } )

    expect( location().pathname ).toBe( '/melete' )
    expect( screen.getByText( 'melete today' ) ).toBeInTheDocument()
  } )

  it( 'keeps a Melete-only member off the Transcriber home page', () => {
    const me = memberFixture( { modules: [ 'melete' ] } )
    const { location } = renderWithRouter( '/', { me } )

    expect( location().pathname ).toBe( '/melete' )
    expect( screen.queryByText( 'home page' ) ).not.toBeInTheDocument()
  } )

  it( 'keeps a Transcriber-only member off Melete', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )
    const { location } = renderWithRouter( '/melete', { me } )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByText( 'home page' ) ).toBeInTheDocument()
  } )
} )
