// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderHookWithClient } from '../test-support/renderWithClient'
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning'

const fire = (): Event => {
  const event = new Event( 'beforeunload', { cancelable: true } )
  window.dispatchEvent( event )

  return event
}

describe( 'useUnsavedChangesWarning', () => {
  it( 'asks the browser to warn while there are unsaved changes', () => {
    renderHookWithClient( () => useUnsavedChangesWarning( true ) )

    expect( fire().defaultPrevented ).toBe( true )
  } )

  it( 'does nothing when clean', () => {
    renderHookWithClient( () => useUnsavedChangesWarning( false ) )

    expect( fire().defaultPrevented ).toBe( false )
  } )

  it( 'follows the flag as it changes', () => {
    const { rerender } = renderHookWithClient(
      ( dirty: boolean ) => useUnsavedChangesWarning( dirty ),
      { initialProps: true },
    )

    rerender( false )

    expect( fire().defaultPrevented ).toBe( false )
  } )

  it( 'stops warning after unmount', () => {
    const { unmount } = renderHookWithClient( () => useUnsavedChangesWarning( true ) )

    unmount()

    expect( fire().defaultPrevented ).toBe( false )
  } )
} )
