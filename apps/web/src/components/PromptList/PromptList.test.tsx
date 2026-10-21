// Testing Library
import { screen, within } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  BUSINESS_ID,
  CODING_ID,
  profilesFixture,
} from '#src/test-support/summarizer.fixture'
import { PromptList } from './PromptList'

const setup = ( selectedId: string | null = null ) => renderWithClient(
  <PromptList profiles={ profilesFixture() } defaultId={ BUSINESS_ID } selectedId={ selectedId } />,
)

describe( 'PromptList', () => {
  it( 'groups the summary profiles and the linker prompt', () => {
    setup()

    const summary = screen.getByRole( 'list', { name: 'Summary profiles' } )
    const linking = screen.getByRole( 'list', { name: 'Linking' } )

    expect( within( summary ).getAllByRole( 'link' ).map( ( link ) => link.textContent ) )
      .toEqual( [ 'Business ideasDefault', 'Coding', 'General' ] )
    expect( within( linking ).getByRole( 'link', { name: 'Linker prompt' } ) )
      .toHaveAttribute( 'href', '/settings/prompts/linker' )
  } )

  it( 'links each profile to its own address', () => {
    setup()

    expect( screen.getByRole( 'link', { name: 'Coding' } ) )
      .toHaveAttribute( 'href', `/settings/prompts/${ CODING_ID }` )
  } )

  it( 'marks the default with text, not colour alone', () => {
    setup()

    const business = screen.getByRole( 'link', { name: /Business ideas/ } )

    expect( within( business ).getByText( 'Default' ) ).toBeInTheDocument()
    expect( within( screen.getByRole( 'link', { name: 'Coding' } ) ).queryByText( 'Default' ) )
      .not.toBeInTheDocument()
  } )

  it( 'marks the selected profile as the current page', () => {
    setup( CODING_ID )

    expect( screen.getByRole( 'link', { name: 'Coding' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
    expect( screen.getByRole( 'link', { name: /Business ideas/ } ) )
      .not.toHaveAttribute( 'aria-current' )
  } )

  it( 'marks the linker prompt when it is selected', () => {
    setup( 'linker' )

    expect( screen.getByRole( 'link', { name: 'Linker prompt' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
  } )
} )
