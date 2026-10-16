// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { mockMatchMedia } from './matchMedia'

describe( 'mockMatchMedia', () => {
  it( 'is installed by the test setup as a wide window with a light OS', () => {
    expect( window.matchMedia( '(min-width:900px)' ).matches ).toBe( true )
    expect( window.matchMedia( '(max-width:899.95px)' ).matches ).toBe( false )
    expect( window.matchMedia( '(prefers-color-scheme: dark)' ).matches ).toBe( false )
  } )

  it( 'can describe a narrow window', () => {
    mockMatchMedia( { isWide: false } )

    expect( window.matchMedia( '(min-width:900px)' ).matches ).toBe( false )
    expect( window.matchMedia( '(max-width:899.95px)' ).matches ).toBe( true )
  } )

  it( 'can describe a dark OS', () => {
    mockMatchMedia( { isDark: true } )

    expect( window.matchMedia( '(prefers-color-scheme: dark)' ).matches ).toBe( true )
  } )

  it( 'ignores the @media prefix', () => {
    expect( window.matchMedia( '@media (min-width:900px)' ).matches ).toBe( true )
  } )

  it( 'tells listeners when the OS scheme changes', () => {
    const controls = mockMatchMedia()
    const query = window.matchMedia( '(prefers-color-scheme: dark)' )
    const onChange = vi.fn()
    query.addEventListener( 'change', onChange )

    controls.setDark( true )

    expect( onChange ).toHaveBeenCalledTimes( 1 )
    expect( query.matches ).toBe( true )

    query.removeEventListener( 'change', onChange )
    controls.setDark( false )

    expect( onChange ).toHaveBeenCalledTimes( 1 )
  } )
} )
