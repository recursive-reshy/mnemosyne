// Vitest
import { describe, expect, it } from 'vitest'
// App
import { createQueryClient } from './queryClient'

describe( 'createQueryClient', () => {
  it( 'does not retry failed queries or refetch on window focus', () => {
    const { queries } = createQueryClient().getDefaultOptions()

    expect( queries?.retry ).toBe( false )
    expect( queries?.refetchOnWindowFocus ).toBe( false )
  } )

  it( 'does not retry failed mutations', () => {
    expect( createQueryClient().getDefaultOptions().mutations?.retry ).toBe( false )
  } )

  it( 'returns a separate client each time', () => {
    expect( createQueryClient() ).not.toBe( createQueryClient() )
  } )
} )
