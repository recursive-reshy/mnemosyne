// Testing Library
import { act, screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { mockMatchMedia } from '#src/test-support/matchMedia'
import { noteFixtures } from '#src/test-support/noteFixtures'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { NoteEditor } from './NoteEditor'

const note = noteFixtures[ '0.2.0 summary with YouTube timestamp links' ] ?? ''

const root = (): Element | null => document.querySelector( '.mdxeditor' )
const popups = (): Element | null => document.querySelector( '.mdxeditor-popup-container' )
const content = (): Element | null => document.querySelector( '[contenteditable="true"]' )

const open = async (): Promise< void > => {
  renderWithClient( <NoteEditor value={ note } onChange={ vi.fn() } /> )
  await screen.findByRole( 'heading', { name: 'Key points' } )
}

beforeEach( () => {
  window.localStorage.clear()
} )

describe( 'NoteEditor dark mode', () => {
  it( 'is light by default', async () => {
    await open()

    expect( root() ).toHaveClass( 'noteEditor' )
    expect( root() ).not.toHaveClass( 'dark-theme' )
    expect( popups() ).not.toHaveClass( 'dark-theme' )
  } )

  it( 'gets the dark theme on the editor and its popups when the scheme is dark', async () => {
    mockMatchMedia( { isDark: true } )
    await open()

    expect( root() ).toHaveClass( 'dark-theme' )
    expect( popups() ).toHaveClass( 'dark-theme' )
    expect( popups() ).toHaveClass( 'noteEditor' )
  } )

  it( 'switches with the colour scheme without remounting the editor', async () => {
    const os = mockMatchMedia( { isDark: false } )
    await open()
    const before = content()
    const text = before?.textContent

    act( () => os.setDark( true ) )

    expect( root() ).toHaveClass( 'dark-theme' )
    expect( popups() ).toHaveClass( 'dark-theme' )
    expect( content() ).toBe( before )
    expect( content()?.textContent ).toBe( text )

    act( () => os.setDark( false ) )

    expect( root() ).not.toHaveClass( 'dark-theme' )
    expect( popups() ).not.toHaveClass( 'dark-theme' )
    expect( content() ).toBe( before )
  } )

  it( 'keeps exactly one popup container across switches', async () => {
    const os = mockMatchMedia( { isDark: false } )
    await open()

    act( () => os.setDark( true ) )
    act( () => os.setDark( false ) )

    expect( document.querySelectorAll( '.mdxeditor-popup-container' ) ).toHaveLength( 1 )
  } )
} )
