// React
import type { ReactElement } from 'react'
// Packages
import GlobalStyles from '@mui/material/GlobalStyles'
import { ThemeProvider } from '@mui/material/styles'
// Testing Library
import { render } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { editorTokens } from './editorTokens'
import { theme } from './theme'

describe( 'editorTokens', () => {
  const tokens = editorTokens( theme )[ ':root' ]

  it( 'defines the three tokens the note editor styles use, and nothing else', () => {
    expect( Object.keys( tokens ).sort() )
      .toEqual( [ '--color-border', '--space-1', '--space-2' ] )
  } )

  it( 'follows the theme divider colour', () => {
    expect( tokens[ '--color-border' ] ).toBe( theme.vars.palette.divider )
    expect( tokens[ '--color-border' ] ).toContain( 'var(' )
  } )

  it( 'keeps the 0.3.0 spacing: a quarter and half of 1rem, on the theme scale', () => {
    expect( tokens[ '--space-1' ] ).toBe( theme.spacing( 0.5 ) )
    expect( tokens[ '--space-2' ] ).toBe( theme.spacing( 1 ) )
    expect( theme.spacing( 1 ) ).toContain( '--mui-spacing' )
  } )

  it( 'is applied to the page by GlobalStyles', () => {
    const app = (): ReactElement => (
      <ThemeProvider theme={ theme }>
        <GlobalStyles styles={ editorTokens } />
      </ThemeProvider>
    )

    render( app() )

    expect( getComputedStyle( document.documentElement ).getPropertyValue( '--space-2' ) )
      .toContain( '--mui-spacing' )
  } )
} )
