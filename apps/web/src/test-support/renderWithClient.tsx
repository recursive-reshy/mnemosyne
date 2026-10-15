// React
import type { ReactElement, ReactNode } from 'react'
// Packages
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router'
import type { Location } from 'react-router'
// Testing Library
import { render, renderHook } from '@testing-library/react'
import type { RenderHookResult, RenderResult } from '@testing-library/react'
// App
import { createQueryClient } from '#src/queryClient'

interface ClientRender extends RenderResult {
  queryClient: QueryClient
  location: () => Location
}

type ClientHookRender< Result, Props > = RenderHookResult< Result, Props > & {
  queryClient: QueryClient
}

export const renderWithClient = (
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
): ClientRender => {
  const queryClient = createQueryClient()
  let current: Location | undefined

  function LocationProbe(): null {
    current = useLocation()

    return null
  }

  const result = render(
    <QueryClientProvider client={ queryClient }>
      <MemoryRouter initialEntries={ [ route ] }>
        <LocationProbe />
        { ui }
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return {
    ...result,
    queryClient,
    location: () => {
      if( current === undefined ) {
        throw new Error( 'The router has not rendered yet' )
      }

      return current
    },
  }
}

export const renderHookWithClient = < Result, Props = undefined >(
  hook: ( props: Props ) => Result,
  options?: { initialProps?: Props, queryClient?: QueryClient },
): ClientHookRender< Result, Props > => {
  const queryClient = options?.queryClient ?? createQueryClient()
  const wrapper = ( { children }: { children: ReactNode } ): ReactElement => (
    <QueryClientProvider client={ queryClient }>{ children }</QueryClientProvider>
  )

  return {
    ...renderHook( hook, { wrapper, initialProps: options?.initialProps as Props } ),
    queryClient,
  }
}
