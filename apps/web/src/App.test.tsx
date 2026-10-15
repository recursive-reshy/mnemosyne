// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { App } from './App'

describe( 'App', () => {
  it( 'shows the Mnemosyne heading', () => {
    render( <App /> )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Mnemosyne' } ) ).toBeInTheDocument()
  } )
} )
