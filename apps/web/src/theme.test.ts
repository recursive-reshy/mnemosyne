// Vitest
import { describe, expect, it } from 'vitest'
// App
import { theme } from './theme'

describe( 'theme', () => {
  it( 'has a light and a dark colour scheme seeded from the 0.3.0 palette', () => {
    expect( theme.colorSchemes.light?.palette.primary.main ).toBe( '#1d4ed8' )
    expect( theme.colorSchemes.dark?.palette.primary.main ).toBe( '#7ea6ff' )
    expect( theme.colorSchemes.light?.palette.background.default ).toBe( '#f4f5f7' )
    expect( theme.colorSchemes.dark?.palette.background.default ).toBe( '#12141a' )
  } )

  it( 'uses CSS variables switched by a class', () => {
    expect( theme.colorSchemeSelector ).toBe( 'class' )
    expect( theme.vars?.palette.primary.main ).toContain( 'var(' )
  } )

  it( 'keeps the 0.3.0 radius and system font', () => {
    expect( theme.shape.borderRadius ).toBe( 8 )
    expect( theme.typography.fontFamily ).toContain( 'system-ui' )
  } )
} )
